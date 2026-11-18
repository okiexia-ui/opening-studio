import AppKit

let openingThemes = ["frost":15.8, "cinnabar":11.8, "midnight":10.8, "aurum":12.2, "civic":12.6, "spell":13.6, "voyage":12.8, "neon":11.6]
let openingThemeNames = ["frost":"雾彩 · 连笔", "cinnabar":"朱砂 · 启卷", "midnight":"霁蓝 · 引力", "aurum":"曜金 · 剧场", "civic":"长城 · 通行", "spell":"星烛 · 咒语", "voyage":"星际 · 远航", "neon":"霓虹 · 雨夜"]
/// Menu order; mirrors film/assets/themes.js (checked by scripts/check-consistency.cjs).
let openingThemeOrder = ["frost", "cinnabar", "midnight", "aurum", "civic", "spell", "voyage", "neon"]

/// The words every opening shows. Defaults, limits and cleaning mirror
/// `normalizeCopy` in film/assets/renderer.js (checked by check-consistency.cjs).
struct Greeting: Codable, Equatable {
    static let standard = Greeting(greeting:"Welcome", name:"Tommy", title:"欢迎回来", seal:"准予通行")
    static let limits = ["greeting":16, "name":16, "title":12, "seal":4]
    var greeting: String
    var name: String
    var title: String
    var seal: String
    /// Drop control and format characters, collapse whitespace, cap the length in
    /// Unicode scalars; an empty result falls back to the default.
    static func clean(_ value: String?, _ key: String, _ fallback: String) -> String {
        let kept = (value ?? "").unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }
        let collapsed = String(String.UnicodeScalarView(kept)).split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let capped = String(String.UnicodeScalarView(collapsed.unicodeScalars.prefix(limits[key] ?? 16)))
            .trimmingCharacters(in: .whitespaces)
        return capped.isEmpty ? fallback : capped
    }
    init(greeting: String, name: String, title: String, seal: String) {
        self.greeting=greeting; self.name=name; self.title=title; self.seal=seal
    }
    init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy:CodingKeys.self)
        let defaults = Greeting.standard
        self.init(greeting:try fields.decodeIfPresent(String.self, forKey:.greeting) ?? defaults.greeting,
                  name:try fields.decodeIfPresent(String.self, forKey:.name) ?? defaults.name,
                  title:try fields.decodeIfPresent(String.self, forKey:.title) ?? defaults.title,
                  seal:try fields.decodeIfPresent(String.self, forKey:.seal) ?? defaults.seal)
    }
    init(fields: [String: Any]) {
        let s=Greeting.standard
        self.init(greeting:Greeting.clean(fields["greeting"] as? String,"greeting",s.greeting),
                  name:Greeting.clean(fields["name"] as? String,"name",s.name),
                  title:Greeting.clean(fields["title"] as? String,"title",s.title),
                  seal:Greeting.clean(fields["seal"] as? String,"seal",s.seal))
    }
    var sanitized: Greeting { Greeting(fields:dictionary) }
    var dictionary: [String: String] { ["greeting":greeting, "name":name, "title":title, "seal":seal] }
}

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
        if let path {
            let url=URL(fileURLWithPath:path)
            if Bundle(url:url)?.bundleIdentifier == bundleID {return url}
        }
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
    /// Absent in older files and while the defaults are in use.
    var greeting: Greeting?
    mutating func update(_ profile:AppProfile) {
        if let i=profiles.firstIndex(where:{$0.bundleID==profile.bundleID}) {profiles[i]=profile}
        else {profiles.append(profile)}
    }
}

final class ProfileStore {
    private(set) var document: ProfileDocument
    let url: URL?
    private(set) var loadError: Error?
    private var lastRead: Data?
    private enum FileProblem: LocalizedError {
        case unsupported, changed
        var errorDescription: String? {
            switch self {
            case .unsupported: return "无法读取此版本的应用设置，原文件已保留。"
            case .changed: return "设置文件已被其他程序修改，请重新启动 Opening Studio 后再保存。"
            }
        }
    }
    private static func contents(_ url:URL) throws -> Data? {
        do {return try Data(contentsOf:url)}
        catch let error as CocoaError where error.code == .fileReadNoSuchFile {return nil}
    }
    init(url: URL?, fallback: [AppProfile]) {
        self.url=url
        document=ProfileDocument(selectedID:fallback[0].bundleID,profiles:fallback)
        do {
            guard let url, let data=try Self.contents(url) else {return}
            let decoded=try JSONDecoder().decode(ProfileDocument.self,from:data)
            guard decoded.version == 1 else {throw FileProblem.unsupported}
            var seen=Set<String>()
            let profiles=decoded.profiles.filter { !$0.bundleID.isEmpty && seen.insert($0.bundleID).inserted }.map { p -> AppProfile in
                var p=p;if openingThemes[p.theme] == nil {p.theme="frost"};return p
            }
            guard !profiles.isEmpty else {throw FileProblem.unsupported}
            document=ProfileDocument(selectedID:decoded.selectedID,profiles:profiles,greeting:decoded.greeting?.sanitized)
            lastRead=data
        } catch {loadError=error}
        if !document.profiles.contains(where:{$0.bundleID==document.selectedID}) {document.selectedID=document.profiles[0].bundleID}
    }
    var selected: AppProfile { profile(document.selectedID) ?? document.profiles[0] }
    var greeting: Greeting { document.greeting ?? .standard }
    func profile(_ id:String)->AppProfile? {document.profiles.first{$0.bundleID==id}}
    func commit(_ change: (inout ProfileDocument) -> Void) throws {
        if let loadError {throw loadError}
        var next=document
        change(&next)
        if let url {
            guard try Self.contents(url) == lastRead else {throw FileProblem.changed}
            let dir=url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
            let encoder=JSONEncoder();encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
            let bytes=try encoder.encode(next)
            let temp=dir.appendingPathComponent(".profiles-"+UUID().uuidString+".tmp")
            let fd=Darwin.open(temp.path,O_WRONLY|O_CREAT|O_EXCL,mode_t(0o600))
            guard fd >= 0 else {throw NSError(domain:NSPOSIXErrorDomain,code:Int(errno))}
            defer {try? FileManager.default.removeItem(at:temp)}
            let file=FileHandle(fileDescriptor:fd,closeOnDealloc:true)
            try file.write(contentsOf:bytes)
            try file.close()
            guard Darwin.rename(temp.path,url.path) == 0 else {throw NSError(domain:NSPOSIXErrorDomain,code:Int(errno))}
            lastRead=bytes
        }
        document=next
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
            return AppProfile(bundleID:id,name:name,theme:legacy.flatMap { openingThemes[$0] != nil ? $0:nil } ?? theme,enabled:enabled,path:FileManager.default.fileExists(atPath:path) ? path:nil)
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
