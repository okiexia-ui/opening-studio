import AppKit
import WebKit
import QuartzCore
import Darwin
import UniformTypeIdentifiers

// No Accessibility or Screen Recording permission is required. Only public
// NSWorkspace lifecycle events and CGWindow metadata (bounds, not pixels).
struct LaunchGate {
    var known: Set<pid_t>
    mutating func coldLaunch(_ pid: pid_t) -> Bool {
        guard pid > 0, !known.contains(pid) else { return false }
        known.insert(pid)
        return true
    }
    mutating func terminated(_ pid: pid_t) { known.remove(pid) }
}

func argument(_ key: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: key), i+1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[i+1]
}

/// One snapshot of on-screen window metadata. Reading it is the expensive part,
/// so callers that need several apps' frames should share a single snapshot.
func visibleWindowList() -> [[String: Any]] {
    CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
}

func desktopTop() -> CGFloat { NSScreen.screens.first?.frame.maxY ?? 0 }

func windowFrame(_ pid: pid_t) -> NSRect? { largestWindowFrame(in: visibleWindowList(), pid: pid, desktopTop: desktopTop()) }

/// The largest normal-layer, visible window of `pid`, flipped into AppKit coordinates.
func largestWindowFrame(in list: [[String: Any]], pid: pid_t, desktopTop: CGFloat) -> NSRect? {
    let candidates = list.filter {
        ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) &&
        ($0[kCGWindowLayer as String] as? Int) == 0 &&
        ($0[kCGWindowAlpha as String] as? Double ?? 1) > 0
    }.compactMap { info -> CGRect? in
        guard let dict = info[kCGWindowBounds as String] as? [String:Any],
              let rect = CGRect(dictionaryRepresentation: dict as CFDictionary), rect.width >= 320, rect.height >= 240 else { return nil }
        return rect
    }
    guard let b = candidates.max(by: { $0.width*$0.height < $1.width*$1.height }) else { return nil }
    return NSRect(x: b.minX, y: desktopTop-b.maxY, width:b.width, height:b.height)
}

final class OverlayPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class Companion: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    let store: ProfileStore
    let preview=CommandLine.arguments.contains("--preview")
    var enabled=UserDefaults.standard.object(forKey:"openingEnabled") as? Bool ?? true
    var statusItem:NSStatusItem?
    var settingsWindow:NSWindow?
    var settingsWeb:WKWebView?
    var gate=LaunchGate(known:[])
    var panel:OverlayPanel!
    var web:WKWebView!
    var content:NSView!
    let mask=CAShapeLayer()
    var ready=false
    var pending:NSRunningApplication?
    var active:NSRunningApplication?
    var playingProfile:AppProfile?
    var token=""
    var awaitingStart=false
    var started:CFTimeInterval=0
    var duration=15.8
    var clock:Timer?
    var sampler:Timer?
    var observations:[NSObjectProtocol]=[]
    var frames:[String:NSRect]=[:]
    var lastLoggedFrame:NSRect?
    var lastSample=0.0
    var sawTargetFrontmost=false
    var animationCount=0
    var icons:[String:String]=[:]
    let logURL:URL
    let timestampFormatter=ISO8601DateFormatter()
    var target:String {playingProfile?.bundleID ?? store.selected.bundleID}

    init(store:ProfileStore) {
        self.store=store
        logURL=argument("--log").map{URL(fileURLWithPath:$0)} ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/WelcomeTommy/events.jsonl")
        super.init()
    }
    func log(_ event:String,_ details:[String:Any]=[:]) {
        var record=details;record["event"]=event;record["timestamp"]=timestampFormatter.string(from:Date())
        if record["target"] == nil {record["target"]=target}
        guard let data=try? JSONSerialization.data(withJSONObject:record,options:[.sortedKeys]) else{return}
        try? FileManager.default.createDirectory(at:logURL.deletingLastPathComponent(),withIntermediateDirectories:true)
        // Rotate instead of wiping, so the events leading up to a problem survive.
        if let attr=try? FileManager.default.attributesOfItem(atPath:logURL.path),(attr[.size] as? Int ?? 0)>1_000_000 {
            let previous=logURL.deletingPathExtension().appendingPathExtension("previous.jsonl")
            try? FileManager.default.removeItem(at:previous);try? FileManager.default.moveItem(at:logURL,to:previous)
        }
        if !FileManager.default.fileExists(atPath:logURL.path) {FileManager.default.createFile(atPath:logURL.path,contents:nil)}
        if let f=try? FileHandle(forWritingTo:logURL) {defer{try? f.close()};_ = try? f.seekToEnd();try? f.write(contentsOf:data+Data([10]))}
    }
    @discardableResult func persist()->Bool {
        do {try store.save();return true} catch {log("settings_save_error",["error":error.localizedDescription]);settingsWeb?.evaluateJavaScript("window.openingError('设置保存失败，请检查文件权限。')");return false}
    }
    func rendererConfig(_ profile:AppProfile)->[String:Any] {
        var result:[String:Any]=["theme":profile.theme,"mark":profile.mark,"appName":profile.name,"copy":store.greeting.dictionary]
        if profile.mark=="portal" {
            if icons[profile.bundleID] == nil {icons[profile.bundleID]=appIconData(profile)}
            result["icon"]=icons[profile.bundleID] ?? ""
        }
        return result
    }
    func settingsPayload()->[String:Any] {
        ["selectedID":store.document.selectedID,"copy":store.greeting.dictionary,"copyDefaults":Greeting.standard.dictionary,"copyLimits":Greeting.limits,"profiles":store.document.profiles.map{p -> [String:Any] in
            var row=rendererConfig(p);row["bundleID"]=p.bundleID;row["name"]=p.name;row["enabled"]=p.enabled;row["installed"]=p.applicationURL != nil;return row
        }]
    }
    func syncSettings() {settingsWeb?.evaluateJavaScript("window.updateOpeningProfiles(\(javascriptJSON(settingsPayload())))")}
    func prewarm() {
        guard ready,active==nil else{return}
        web.evaluateJavaScript("window.configureWelcome(\(javascriptJSON(rendererConfig(store.selected))))")
    }
    func applicationDidFinishLaunching(_ notification:Notification) {
        NSApp.setActivationPolicy(.accessory)
        // Seed every existing process, including apps that may be enabled later.
        gate.known=Set(NSWorkspace.shared.runningApplications.map(\.processIdentifier))
        for profile in store.document.profiles {
            if let s=UserDefaults.standard.string(forKey:"frame-"+profile.bundleID) {frames[profile.bundleID]=NSRectFromString(s)}
        }
        prepareWindow();prepareMenu();persist()
        let distributed=DistributedNotificationCenter.default()
        observations.append(distributed.addObserver(forName:Notification.Name("local.tommy.welcome.show-settings"),object:notificationScope,queue:.main){[weak self] _ in self?.showSettings()})
        observations.append(distributed.addObserver(forName:Notification.Name("local.tommy.welcome.set-theme"),object:notificationScope,queue:.main){[weak self] n in
            if let theme=n.userInfo?["theme"] as? String {self?.selectTheme(theme)}
        })
        let center=NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.willLaunchApplicationNotification,NSWorkspace.didLaunchApplicationNotification] {
            observations.append(center.addObserver(forName:name,object:nil,queue:.main){[weak self] n in
                guard let self,let app=n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      !self.preview,let id=app.bundleIdentifier,let profile=self.store.profile(id),self.gate.coldLaunch(app.processIdentifier) else{return}
                self.log("cold_launch_detected",["pid":app.processIdentifier,"target":id])
                guard self.enabled,profile.enabled else {self.log("cold_launch_ignored_disabled",["target":id]);return}
                self.pending=app
                if self.ready {self.begin(app,profile:profile)}
            })
        }
        observations.append(center.addObserver(forName:NSWorkspace.didTerminateApplicationNotification,object:nil,queue:.main){[weak self] n in
            guard let self,let app=n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else{return}
            self.gate.terminated(app.processIdentifier)
            if self.pending?.processIdentifier==app.processIdentifier {self.pending=nil}
            if self.active?.processIdentifier==app.processIdentifier {self.finish("target_terminated")}
            if let id=app.bundleIdentifier,self.store.profile(id) != nil {self.log("target_terminated",["pid":app.processIdentifier,"target":id])}
        })
        observations.append(center.addObserver(forName:NSWorkspace.didActivateApplicationNotification,object:nil,queue:.main){[weak self] n in
            guard let self,let app=n.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else{return}
            if self.active?.processIdentifier==app.processIdentifier {self.sawTargetFrontmost=true}
            else if self.active != nil,self.sawTargetFrontmost,app.processIdentifier != ProcessInfo.processInfo.processIdentifier {self.finish("user_switched_app")}
            if let id=app.bundleIdentifier,self.store.profile(id) != nil {self.log("activation_no_replay",["pid":app.processIdentifier,"target":id])}
        })
        sampler=Timer.scheduledTimer(withTimeInterval:1,repeats:true){[weak self] _ in self?.rememberBounds()}
        log("observer_ready",["existingPIDs":Array(gate.known),"profiles":store.document.profiles.map(\.bundleID),"mode":preview ? "manual_preview":"cold_launch_only"])
        if CommandLine.arguments.contains("--settings") {showSettings()}
    }
    func prepareWindow() {
        let frame=frames[store.selected.bundleID] ?? defaultFrame()
        panel=OverlayPanel(contentRect:frame,styleMask:[.borderless,.nonactivatingPanel],backing:.buffered,defer:false)
        panel.isOpaque=false;panel.backgroundColor = .clear;panel.hasShadow=false;panel.level = .floating
        panel.ignoresMouseEvents=true;panel.hidesOnDeactivate=false;panel.isReleasedWhenClosed=false
        panel.collectionBehavior=[.canJoinAllSpaces,.fullScreenAuxiliary,.ignoresCycle]
        content=NSView(frame:NSRect(origin:.zero,size:frame.size));content.wantsLayer=true;content.layer?.backgroundColor=NSColor.clear.cgColor
        mask.fillRule = .evenOdd;mask.fillColor=NSColor.black.cgColor;content.layer?.mask=mask
        let effect=NSVisualEffectView(frame:content.bounds);effect.autoresizingMask=[.width,.height]
        effect.material = .underWindowBackground;effect.blendingMode = .behindWindow;effect.state = .active;effect.appearance=NSAppearance(named:.aqua);content.addSubview(effect)
        let config=WKWebViewConfiguration();config.userContentController.add(self,name:"welcome")
        config.userContentController.addUserScript(WKUserScript(source:"window.INITIAL_OPENING=\(javascriptJSON(rendererConfig(store.selected)));",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        web=WKWebView(frame:content.bounds,configuration:config);web.autoresizingMask=[.width,.height]
        web.setValue(false,forKey:"drawsBackground");web.navigationDelegate=self
        content.addSubview(web);panel.contentView=content
        let resources=Bundle.main.resourceURL!.appendingPathComponent("film")
        web.loadFileURL(resources.appendingPathComponent("native.html"),allowingReadAccessTo:resources);applyMask(0)
    }
    func prepareMenu() {
        if statusItem==nil {statusItem=NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength)}
        statusItem?.button?.image=NSImage(systemSymbolName:"circle.dotted",accessibilityDescription:"Opening Studio")
        statusItem?.button?.toolTip="Opening Studio · 应用开屏"
        let menu=NSMenu()
        func item(_ title:String,_ action:Selector,_ value:String?=nil)->NSMenuItem {
            let x=NSMenuItem(title:title,action:action,keyEquivalent:"");x.target=self;x.representedObject=value;return x
        }
        menu.addItem(item("应用与开屏…",#selector(showSettings)));menu.addItem(.separator())
        let apps=NSMenuItem(title:"当前应用："+store.selected.name,action:nil,keyEquivalent:""),submenu=NSMenu()
        for p in store.document.profiles {let x=item(p.name+(p.enabled ? "":"（关闭）"),#selector(profileClicked(_:)),p.bundleID);x.state=p.bundleID==store.document.selectedID ? .on:.off;submenu.addItem(x)}
        apps.submenu=submenu;menu.addItem(apps)
        let styles=NSMenuItem(title:"开屏样式："+(openingThemeNames[store.selected.theme] ?? store.selected.theme),action:nil,keyEquivalent:""),styleMenu=NSMenu()
        for id in openingThemeOrder {let x=item(openingThemeNames[id]!,#selector(themeClicked(_:)),id);x.state=id==store.selected.theme ? .on:.off;styleMenu.addItem(x)}
        styles.submenu=styleMenu;menu.addItem(styles)
        menu.addItem(.separator());menu.addItem(item("预览当前应用开屏",#selector(previewSelected)))
        menu.addItem(item("添加应用…",#selector(addApplication)))
        menu.addItem(item(enabled ? "暂停全部开屏":"启用全部开屏",#selector(toggleEnabled)))
        menu.addItem(.separator())
        let quit=item("退出 Opening Studio",#selector(quitCompanion));quit.keyEquivalent="q";quit.toolTip="下次登录，或运行“重新启用开场动画”时恢复";menu.addItem(quit)
        statusItem?.menu=menu
    }
    /// A clean exit stays stopped: the LaunchAgent only restarts after a crash.
    @objc func quitCompanion() {log("quit_by_user");NSApp.terminate(nil)}
    @objc func profileClicked(_ item:NSMenuItem) {if let id=item.representedObject as? String {selectProfile(id)}}
    func selectProfile(_ id:String) {
        guard store.profile(id) != nil else{return};store.document.selectedID=id;persist();prepareMenu();syncSettings();prewarm()
    }
    @objc func themeClicked(_ item:NSMenuItem) {if let id=item.representedObject as? String {selectTheme(id)}}
    func selectTheme(_ theme:String) {
        guard openingThemes[theme] != nil else{return};var p=store.selected;p.theme=theme;store.update(p);persist();prepareMenu();syncSettings();prewarm()
        log("theme_selected",["target":p.bundleID,"theme":theme])
    }
    @objc func toggleEnabled() {
        enabled.toggle();UserDefaults.standard.set(enabled,forKey:"openingEnabled")
        if !enabled {pending=nil;finish("disabled_by_user")};prepareMenu()
    }
    @objc func previewSelected() {
        guard ready,let app=NSRunningApplication.runningApplications(withBundleIdentifier:store.selected.bundleID).first else {
            showSettings();settingsWeb?.evaluateJavaScript("window.openingError('请先打开所选应用，再预览真实窗口转场。')");return
        }
        settingsWindow?.orderOut(nil);app.activate(options:[.activateIgnoringOtherApps]);begin(app,profile:store.selected,manual:true)
    }
    @objc func addApplication() {
        let panel=NSOpenPanel();panel.title="选择要添加开屏的应用";panel.prompt="添加应用";panel.allowedContentTypes=[.application]
        panel.canChooseFiles=true;panel.canChooseDirectories=false;panel.allowsMultipleSelection=false
        panel.directoryURL=URL(fileURLWithPath:"/Applications");NSApp.activate(ignoringOtherApps:true)
        panel.begin{[weak self] result in
            guard let self,result == .OK,let url=panel.url else{return}
            guard let profile=AppProfile.fromApplication(url) else{self.settingsWeb?.evaluateJavaScript("window.openingError('请选择普通桌面应用，后台工具无法显示窗口开屏。')");return}
            if self.store.profile(profile.bundleID)==nil {self.store.update(profile)}
            self.selectProfile(profile.bundleID);self.showSettings()
            self.log("application_added",["target":profile.bundleID])
        }
    }
    @objc func showSettings() {
        if let settingsWindow {syncSettings();settingsWindow.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);return}
        let screen=NSScreen.main?.visibleFrame ?? NSRect(x:0,y:0,width:1440,height:900)
        let size=NSSize(width:min(1180,screen.width-80),height:min(860,screen.height-70))
        let window=NSWindow(contentRect:NSRect(origin:.zero,size:size),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Opening Studio · 应用与开屏";window.minSize=NSSize(width:700,height:660);window.isReleasedWhenClosed=false
        let config=WKWebViewConfiguration();config.userContentController.add(self,name:"settings")
        config.userContentController.addUserScript(WKUserScript(source:"window.OPENING_PROFILES=\(javascriptJSON(settingsPayload()));",injectionTime:.atDocumentStart,forMainFrameOnly:true))
        let gallery=WKWebView(frame:NSRect(origin:.zero,size:size),configuration:config);gallery.autoresizingMask=[.width,.height];gallery.navigationDelegate=self
        let resources=Bundle.main.resourceURL!.appendingPathComponent("film")
        gallery.loadFileURL(resources.appendingPathComponent("gallery.html"),allowingReadAccessTo:resources)
        window.contentView=gallery;settingsWindow=window;settingsWeb=gallery;window.center();window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true)
        log("settings_opened")
    }
    func defaultFrame()->NSRect {
        let screen=NSScreen.main?.visibleFrame ?? NSRect(x:0,y:0,width:1440,height:900)
        let size=NSSize(width:min(1120,screen.width*0.84),height:min(790,screen.height*0.87))
        return NSRect(x:screen.midX-size.width/2,y:screen.midY-size.height/2,width:size.width,height:size.height)
    }
    /// Remember where each enabled app's window lives, so the next cold launch
    /// opens over the right area before that app has drawn a window.
    func rememberBounds() {
        guard enabled else{return}
        let running=store.document.profiles.filter(\.enabled).compactMap {p -> (AppProfile,pid_t)? in
            NSRunningApplication.runningApplications(withBundleIdentifier:p.bundleID).first.map{(p,$0.processIdentifier)}
        }
        guard !running.isEmpty else{return}
        let list=visibleWindowList(),top=desktopTop()
        for (p,pid) in running {
            guard let frame=largestWindowFrame(in:list,pid:pid,desktopTop:top) else{continue}
            if frames[p.bundleID] != frame {frames[p.bundleID]=frame;UserDefaults.standard.set(NSStringFromRect(frame),forKey:"frame-"+p.bundleID)}
        }
    }
    func begin(_ app:NSRunningApplication,profile:AppProfile,manual:Bool=false) {
        guard !app.isTerminated else{return}
        if active?.processIdentifier==app.processIdentifier {return}
        if active != nil {finish("superseded_by_new_launch")}
        pending=nil;active=app;playingProfile=profile;duration=openingThemes[profile.theme] ?? 15.8
        token=UUID().uuidString;awaitingStart=true;sawTargetFrontmost=NSWorkspace.shared.frontmostApplication?.processIdentifier==app.processIdentifier
        let frame=windowFrame(app.processIdentifier) ?? frames[profile.bundleID] ?? defaultFrame()
        panel.setFrame(frame,display:true);panel.alphaValue=0;applyMask(0);lastLoggedFrame=frame;lastSample=0
        panel.orderFrontRegardless();started=CACurrentMediaTime();animationCount+=1
        var config=rendererConfig(profile);config["token"]=token
        web.evaluateJavaScript("window.playWelcome(\(javascriptJSON(config)))")
        log("animation_started",["pid":app.processIdentifier,"count":animationCount,"frame":NSStringFromRect(frame),"manual":preview || manual,"theme":profile.theme,"mark":profile.mark,"duration":duration])
        clock=Timer(timeInterval:1/60,repeats:true){[weak self] _ in self?.tick()};RunLoop.main.add(clock!,forMode:.common)
    }
    func tick() {
        guard let app=active,let profile=playingProfile else{return}
        let elapsed=CACurrentMediaTime()-started
        if app.isTerminated {finish("target_terminated");return}
        if awaitingStart {if elapsed>15 {finish("renderer_start_timeout")};return}
        if elapsed-lastSample>=1/30 {
            lastSample=elapsed
            if let frame=windowFrame(app.processIdentifier) {
                if !NSEqualRects(panel.frame,frame) {panel.setFrame(frame,display:true)}
                if let old=lastLoggedFrame,!NSEqualRects(old,frame) {log("window_followed",["frame":NSStringFromRect(frame)]);lastLoggedFrame=frame}
                frames[profile.bundleID]=frame
            }
        }
        applyMask(elapsed);if elapsed>=duration+0.25 {finish("completed_watchdog")}
    }
    func applyMask(_ realTime:Double) {
        let t=realTime / duration * 15.8
        let b=content.bounds
        let path=CGMutablePath()
        path.addRoundedRect(in:b,cornerWidth:12,cornerHeight:12)
        let z=max(0,min(1,(t-13.5)/2.3)),u=max(0,min(1,z*1.25)),s=u*u*(3-2*u)
        let scale=min(b.width/1920,b.height/1080)
        let extent=max(2250,hypot(b.width,b.height)/max(scale,0.001))
        let radius=pow(max(0,min(1,(t-13.82)/1.98)),2.45)*extent
        if radius>0 {
            let cx=(b.width-1920*scale)/2+(1392+(960-1392)*s)*scale
            let cy=b.height/2
            path.addEllipse(in:CGRect(x:cx-radius*scale,y:cy-radius*scale,width:radius*2*scale,height:radius*2*scale))
        }
        CATransaction.begin();CATransaction.setDisableActions(true);mask.frame=b;mask.path=path;CATransaction.commit()
    }

    func finish(_ reason:String) {
        guard active != nil else{return};clock?.invalidate();clock=nil;panel.orderOut(nil);web.evaluateJavaScript("window.stopWelcome()")
        log("animation_finished",["reason":reason,"elapsed":CACurrentMediaTime()-started])
        if let profile=playingProfile,let frame=frames[profile.bundleID] {UserDefaults.standard.set(NSStringFromRect(frame),forKey:"frame-"+profile.bundleID)}
        active=nil;playingProfile=nil;sawTargetFrontmost=false;awaitingStart=false;lastSample=0;token=""
        if preview {NSApp.terminate(nil)}
    }
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage) {
        guard let body=message.body as? [String:Any],let event=body["event"] as? String else{return}
        if message.name=="settings" {
            switch event {
            case "ready": syncSettings();log("settings_ready")
            case "select_profile": if let id=body["bundleID"] as? String {selectProfile(id)}
            case "add_app": addApplication()
            case "copy":
                // One greeting for every app and style; the defaults are stored as "absent".
                let next=Greeting(fields:body)
                store.document.greeting = next == .standard ? nil:next
                guard persist() else{return};prewarm()
                settingsWeb?.evaluateJavaScript("window.didSaveCopy(\(javascriptJSON(next.dictionary)))")
                log("greeting_saved",["custom":next != .standard])
            case "apply":
                guard let id=body["bundleID"] as? String,var p=store.profile(id),let theme=body["theme"] as? String,openingThemes[theme] != nil else{return}
                p.theme=theme;p.enabled=body["enabled"] as? Bool ?? p.enabled;store.update(p);store.document.selectedID=id
                guard persist() else{return};prepareMenu();prewarm()
                if !p.enabled,playingProfile?.bundleID==id {finish("profile_disabled")}
                settingsWeb?.evaluateJavaScript("window.didApplyTheme(\(javascriptJSON(["bundleID":id,"theme":theme,"enabled":p.enabled])))")
                log("profile_saved",["target":id,"theme":theme,"enabled":p.enabled])
            default: break
            }
            return
        }
        if event=="ready" {
            ready=true;log("renderer_ready")
            if preview {
                if let app=NSRunningApplication.runningApplications(withBundleIdentifier:store.selected.bundleID).first {begin(app,profile:store.selected,manual:true)}
                else {log("preview_target_not_running");print("请先打开所选应用，再运行手动预览。");NSApp.terminate(nil)}
            }
            else if let app=pending,let id=app.bundleIdentifier,let p=store.profile(id),p.enabled,enabled {begin(app,profile:p)}
            return
        }
        guard let eventToken=body["token"] as? String,eventToken==token,active != nil else{return}
        if event=="started" {
            // The renderer is the source of truth for timing; the native table is only a fallback.
            if let rendered=body["duration"] as? Double,rendered>0 {duration=rendered}
            started=CACurrentMediaTime();awaitingStart=false;panel.alphaValue=1;log("animation_visible",["duration":duration])
        }
        else if event=="finished" {finish("completed")}
    }
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error) {log("renderer_error",["error":error.localizedDescription]);if webView==web {finish("renderer_error")}}
    func webViewWebContentProcessDidTerminate(_ webView:WKWebView) {
        if webView==web {finish("renderer_process_terminated");ready=false};webView.reload()
    }
    func applicationWillTerminate(_ notification:Notification) {clock?.invalidate();sampler?.invalidate();panel?.orderOut(nil)}
}

func runSelfTest() {
    var gate=LaunchGate(known:[101]);precondition(!gate.coldLaunch(101));precondition(gate.coldLaunch(202));precondition(!gate.coldLaunch(202));precondition(!gate.coldLaunch(0))
    gate.terminated(202);precondition(gate.coldLaunch(202))
    let a=AppProfile(bundleID:"com.openai.codex",name:"ChatGPT",theme:"frost",enabled:true)
    let b=AppProfile(bundleID:"com.anthropic.claudefordesktop",name:"Claude",theme:"cinnabar",enabled:true)
    let c=AppProfile(bundleID:"local.test.other",name:"Other",theme:"aurum",enabled:false)
    let store=ProfileStore(url:nil,fallback:[a,b,c]);var edit=b;edit.theme="midnight";store.update(edit)
    precondition(store.profile(a.bundleID)==a && store.profile(c.bundleID)==c && store.profile(b.bundleID)?.theme=="midnight")
    precondition(a.mark=="openai" && b.mark=="claude" && c.mark=="portal")
    precondition(javascriptJSON(["name":"A\"B\\C"]).contains("A\\\"B"))
    func window(_ pid:Int,_ x:Int,_ y:Int,_ w:Int,_ h:Int,layer:Int=0,alpha:Double=1)->[String:Any] {
        [kCGWindowOwnerPID as String:pid,kCGWindowLayer as String:layer,kCGWindowAlpha as String:alpha,
         kCGWindowBounds as String:["X":x,"Y":y,"Width":w,"Height":h]]
    }
    let windows=[window(7,0,0,200,150),window(7,100,40,900,600),window(7,0,0,1600,1000,layer:25),
                 window(7,0,0,1500,950,alpha:0),window(8,0,0,1700,1100),window(7,50,30,800,500)]
    precondition(largestWindowFrame(in:windows,pid:7,desktopTop:1000)==NSRect(x:100,y:360,width:900,height:600))
    precondition(largestWindowFrame(in:windows,pid:9,desktopTop:1000)==nil)
    precondition(Greeting.clean("  Ada\u{0007}  \n Lovelace\u{202E} ","name","x")=="Ada Lovelace")
    precondition(Greeting.clean("   ","seal","准予通行")=="准予通行" && Greeting.clean("一二三四五","seal","x")=="一二三四")
    precondition(Greeting(fields:["name":"Ada","greeting":7]).dictionary==["greeting":"Welcome","name":"Ada","title":"欢迎回来","seal":"准予通行"])
    let legacy=try! JSONDecoder().decode(ProfileDocument.self,from:Data(#"{"version":1,"selectedID":"a","profiles":[{"bundleID":"a","name":"A","theme":"frost","enabled":true}]}"#.utf8))
    precondition(legacy.greeting==nil)
    var custom=legacy;custom.greeting=Greeting(fields:["name":"小明","seal":"通"])
    precondition(try! JSONDecoder().decode(ProfileDocument.self,from:JSONEncoder().encode(custom)).greeting?.name=="小明")
    print("PASS: launch gate, PID reuse, profile isolation, app mark routing, JS escaping, window selection, greeting cleaning and storage")
}
if CommandLine.arguments.contains("--self-test") {runSelfTest();exit(0)}
let notificationScope=argument("--profiles").map{"test-"+URL(fileURLWithPath:$0).lastPathComponent} ?? argument("--target") ?? "com.openai.codex"
let app=NSApplication.shared
if CommandLine.arguments.contains("--diagnose") {
    let id=argument("--target") ?? "com.openai.codex"
    let result=NSRunningApplication.runningApplications(withBundleIdentifier:id).map {a -> [String:Any] in ["pid":a.processIdentifier,"bundle":a.bundleIdentifier ?? "","active":a.isActive,"frame":windowFrame(a.processIdentifier).map{NSStringFromRect($0)} ?? "unavailable"]}
    print(javascriptJSON(result));exit(0)
}
var singletonFD:Int32 = -1
if !CommandLine.arguments.contains("--preview") {
    let scope=notificationScope.replacingOccurrences(of:"/",with:"_")
    singletonFD=Darwin.open("/private/tmp/local.tommy.welcome-companion-\(getuid())-\(scope).lock",O_CREAT|O_RDWR,mode_t(0o600))
    if singletonFD<0 || flock(singletonFD,LOCK_EX|LOCK_NB) != 0 {
        if CommandLine.arguments.contains("--settings") {DistributedNotificationCenter.default().postNotificationName(Notification.Name("local.tommy.welcome.show-settings"),object:notificationScope,userInfo:nil,deliverImmediately:true)}
        if let theme=argument("--theme"),openingThemes[theme] != nil {DistributedNotificationCenter.default().postNotificationName(Notification.Name("local.tommy.welcome.set-theme"),object:notificationScope,userInfo:["theme":theme],deliverImmediately:true)}
        print("Opening Studio is already observing applications.");exit(0)
    }
}
let store:ProfileStore
if let target=argument("--target"),argument("--profiles")==nil {
    store=ProfileStore(url:nil,fallback:[AppProfile(bundleID:target,name:target,theme:argument("--theme") ?? "frost",enabled:true)])
} else {
    let config=argument("--profiles").map{URL(fileURLWithPath:$0)} ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/WelcomeTommy/profiles.json")
    store=ProfileStore(url:config,fallback:ProfileStore.defaults())
}
let delegate=Companion(store:store);app.delegate=delegate;app.run()
