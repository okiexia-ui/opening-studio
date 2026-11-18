import AppKit
import Dispatch

final class Fixture: NSObject,NSApplicationDelegate {
    var window:NSWindow!
    var sources:[DispatchSourceSignal]=[]
    func applicationDidFinishLaunching(_ n:Notification) {
        window=NSWindow(contentRect:NSRect(x:160,y:160,width:900,height:600),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
        window.title="Welcome Tommy — integration test"
        let label=NSTextField(labelWithString:"Window tracking test")
        label.font=NSFont.systemFont(ofSize:24,weight:.light)
        label.frame=NSRect(x:30,y:240,width:700,height:50)
        window.contentView?.addSubview(label)
        window.center()
        if !CommandLine.arguments.contains("--background-fixture") {
            let delay=CommandLine.arguments.contains("--delayed-fixture") ? 0.25 : 0
            DispatchQueue.main.asyncAfter(deadline:.now()+delay) { [weak self] in
                self?.window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps:true)
            }
        }
        signal(SIGUSR1,SIG_IGN)
        let resize=DispatchSource.makeSignalSource(signal:SIGUSR1,queue:.main)
        resize.setEventHandler{[weak self] in self?.window.setFrame(NSRect(x:260,y:140,width:740,height:680),display:true)}
        resize.resume();sources.append(resize)
        signal(SIGUSR2,SIG_IGN)
        let hide=DispatchSource.makeSignalSource(signal:SIGUSR2,queue:.main)
        hide.setEventHandler{NSApp.hide(nil)};hide.resume();sources.append(hide)
        signal(SIGHUP,SIG_IGN)
        let dismiss=DispatchSource.makeSignalSource(signal:SIGHUP,queue:.main)
        dismiss.setEventHandler{[weak self] in self?.window.orderOut(nil)}
        dismiss.resume();sources.append(dismiss)
    }
    func applicationShouldHandleReopen(_ app:NSApplication,hasVisibleWindows flag:Bool)->Bool {window.makeKeyAndOrderFront(nil);app.activate(ignoringOtherApps:true);return true}
}
let a=NSApplication.shared;let d=Fixture();a.delegate=d;a.run()
