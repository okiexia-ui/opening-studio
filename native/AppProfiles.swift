import AppKit

let openingThemes = ["frost":15.8, "cinnabar":11.8, "midnight":10.8, "aurum":12.2]
let openingThemeNames = ["frost":"雾彩 · 连笔", "cinnabar":"朱砂 · 启卷", "midnight":"霁蓝 · 引力", "aurum":"曜金 · 剧场"]

struct AppProfile: Codable, Equatable {
    var bundleID: String
    var name: String
    var theme: String
    var enabled: Bool
    var path: String?
    var mark: String {
        if bundleID == "com.anthropic.claudefordesktop" { return "claude" }
        if ["com.openai.codex", "com.openai.chat"].contains(bundleID) { return "openai" }
        return "portal"
    }
    var applicationURL: URL? {
        if let path, FileManager.default.fileExists(atPath:path) { return URL(fileURLWithPath:path) }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier:bundleID)
    }
    static func fromApplication(_ url: URL) -> AppProfile? {
        guard url.pathExtension.lowercased() == "app", let bundle=Bundle(url:url),
              let id=bundle.bundleIdentifier, id != "local.tommy.welcome-companion",
              bundle.infoDictionary?["LSUIElement"] as? Bool != true,
              bundle.infoDictionary?["LSBackgroundOnly"] as? Bool != true else { return nil }
        let name=bundle.object(forInfoDictionaryKey:"CFBundleDisplayName") as? String
            ?? bundle.object(forInfoDictionaryKey:"CFBundleName") as? String
            ?? url.deletingPathExtension().lastPathComponent
        return AppProfile(bundleID:id,name:name,theme:id.contains("anthropic") ? "cinnabar":"midnight",enabled:true,path:url.path)
    }
}

struct ProfileDocument: Codable {
    var version=1
    var selectedID: String
    var profiles: [AppProfile]
}

final class ProfileStore {
    var document: ProfileDocument
    let url: URL?
    init(url: URL?, fallback: [AppProfile]) {
        self.url=url
        if let url, let data=try? Data(contentsOf:url), let decoded=try? JSONDecoder().decode(ProfileDocument.self,from:data), !decoded.profiles.isEmpty {
            var seen=Set<String>()
            let profiles=decoded.profiles.filter { !$0.bundleID.isEmpty && seen.insert($0.bundleID).inserted }.map { p -> AppProfile in
                var p=p;if openingThemes[p.theme] == nil {p.theme="frost"};return p
            }
            document=ProfileDocument(selectedID:decoded.selectedID,profiles:profiles.isEmpty ? fallback:profiles)
        } else { document=ProfileDocument(selectedID:fallback[0].bundleID,profiles:fallback) }
        if !document.profiles.contains(where:{$0.bundleID==document.selectedID}) {document.selectedID=document.profiles[0].bundleID}
    }
    var selected: AppProfile { profile(document.selectedID) ?? document.profiles[0] }
    func profile(_ id:String)->AppProfile? {document.profiles.first{$0.bundleID==id}}
    func save() throws {
        guard let url else{return}
        try FileManager.default.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
        let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        try encoder.encode(document).write(to:url,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path)
    }
    func update(_ profile:AppProfile) {
        if let i=document.profiles.firstIndex(where:{$0.bundleID==profile.bundleID}) {document.profiles[i]=profile}
        else {document.profiles.append(profile)}
    }
    static func defaults()->[AppProfile] {
        let rows:[(String,String,String,Bool)]=[
            ("com.openai.codex","ChatGPT","frost",true),
            ("com.anthropic.claudefordesktop","Claude","cinnabar",true),
            ("com.openai.chat","ChatGPT Classic","frost",false),
            ("com.microsoft.VSCode","Visual Studio Code","midnight",false),
            ("md.obsidian","Obsidian","aurum",false),
            ("ai.opencode.desktop","OpenCode","midnight",false),
            ("com.tinyspeck.slackmacgap","Slack","cinnabar",false)]
        return rows.map {id,name,theme,enabled in
            let path="/Applications/\(name).app"
            let legacy=id=="com.openai.codex" ? UserDefaults.standard.string(forKey:"openingTheme"):nil
            return AppProfile(bundleID:id,name:name,theme:legacy ?? theme,enabled:enabled,path:FileManager.default.fileExists(atPath:path) ? path:nil)
        }
    }
}

func javascriptJSON(_ value: Any)->String {
    guard let data=try? JSONSerialization.data(withJSONObject:value,options:[.fragmentsAllowed,.sortedKeys]),let text=String(data:data,encoding:.utf8) else{return "null"}
    return text
}

func appIconData(_ profile:AppProfile)->String? {
    guard profile.mark == "portal",let url=profile.applicationURL else{return nil}
    let source=NSWorkspace.shared.icon(forFile:url.path),size=NSSize(width:192,height:192)
    let image=NSImage(size:size);image.lockFocus();source.draw(in:NSRect(origin:.zero,size:size));image.unlockFocus()
    guard let tiff=image.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]) else{return nil}
    return "data:image/png;base64,"+png.base64EncodedString()
}
