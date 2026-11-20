import AppKit

let openingThemes = ["frost":15.8, "ink":12.4, "aurora":12, "terminal":11.4, "civic":12.6, "spell":13.6, "voyage":12.8, "neon":11.6]
let openingThemeNames = ["frost":"雾彩 · 连笔", "ink":"水墨 · 山水", "aurora":"极光 · 冰原", "terminal":"磷光 · 终端", "civic":"长城 · 通行", "spell":"星烛 · 咒语", "voyage":"星际 · 远航", "neon":"霓虹 · 雨夜"]
/// Menu order; mirrors film/assets/themes.js (checked by scripts/check-consistency.cjs).
let openingThemeOrder = ["frost", "ink", "aurora", "terminal", "civic", "spell", "voyage", "neon"]
/// Retired styles map to their replacements; mirrors LEGACY in film/assets/style.js.
let openingThemeLegacy = ["cinnabar":"ink", "midnight":"aurora", "aurum":"terminal"]
/// A stored or requested theme id, moved forward if retired; nil when unknown.
func currentTheme(_ id: String?) -> String? {
    guard let id else {return nil}
    let moved = openingThemeLegacy[id] ?? id
    return openingThemes[moved] != nil ? moved : nil
}

/// One style's options as the settings page saved them. The renderer gives them
/// meaning (palettes, fonts, elements) from film/assets/themes.js; native code
/// only keeps the shape safe: short identifiers, a hex colour, bounded numbers.
/// Every field decodes on its own, so one bad value never blocks the file.
struct StyleOptions: Codable, Equatable {
    var palette: String?
    var accent: String?
    var pace: String?
    var font: String?
    var layout: String?
    var size: Double?
    var elements: [String: Double]?
    static let sizeRange = 0.75...1.25
    static func identifier(_ value: Any?) -> String? {
        guard let s = value as? String, s.range(of:"^[a-z0-9-]{1,24}$", options:.regularExpression) != nil else {return nil}
        return s
    }
    static func colour(_ value: Any?) -> String? {
        guard let s = value as? String, s.range(of:"^#[0-9a-fA-F]{6}$", options:.regularExpression) != nil else {return nil}
        return s.lowercased()
    }
    static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber else {return nil}
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }
    init(fields: [String: Any]) {
        palette = Self.identifier(fields["palette"]); pace = Self.identifier(fields["pace"])
        font = Self.identifier(fields["font"]); layout = Self.identifier(fields["layout"])
        accent = Self.colour(fields["accent"])
        size = Self.number(fields["size"]).map { min(Self.sizeRange.upperBound, max(Self.sizeRange.lowerBound, $0)) }
        if let raw = fields["elements"] as? [String: Any] {
            var kept: [String: Double] = [:]
            for key in raw.keys.sorted().prefix(16) where Self.identifier(key) != nil {
                if let v = Self.number(raw[key]) {kept[key] = min(1, max(0, v))}
            }
            elements = kept.isEmpty ? nil : kept
        }
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy:CodingKeys.self)
        var fields: [String: Any] = [:]
        for key in [CodingKeys.palette, .accent, .pace, .font, .layout] { if let v = try? c.decodeIfPresent(String.self, forKey:key) {fields[key.stringValue]=v} }
        if let v = try? c.decodeIfPresent(Double.self, forKey:.size) {fields["size"]=v}
        if let v = try? c.decodeIfPresent([String: Double].self, forKey:.elements) {fields["elements"]=v}
        self.init(fields:fields)
    }
    var dictionary: [String: Any] {
        var out: [String: Any] = [:]
        if let palette {out["palette"]=palette}; if let accent {out["accent"]=accent}; if let pace {out["pace"]=pace}
        if let font {out["font"]=font}; if let layout {out["layout"]=layout}; if let size {out["size"]=size}
        if let elements {out["elements"]=elements}
        return out
    }
    var isEmpty: Bool { dictionary.isEmpty }
}

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
        return AppProfile(bundleID:id,name:name,theme:id.contains("anthropic") ? "ink":"aurora",enabled:true,path:url.path)
    }
}

struct ProfileDocument: Codable {
    var version=1
    var selectedID: String
    var profiles: [AppProfile]
    /// Absent in older files and while the defaults are in use.
    var greeting: Greeting?
    /// Per-style options by theme id; absent until someone customises a style.
    var styles: [String: StyleOptions]?
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
                var p=p;p.theme=currentTheme(p.theme) ?? "frost";return p
            }
            guard !profiles.isEmpty else {throw FileProblem.unsupported}
            var styles=[String: StyleOptions]()
            for (key,options) in decoded.styles ?? [:] {
                if let theme=currentTheme(key),!options.isEmpty {styles[theme]=options}
            }
            document=ProfileDocument(selectedID:decoded.selectedID,profiles:profiles,greeting:decoded.greeting?.sanitized,styles:styles.isEmpty ? nil:styles)
            lastRead=data
        } catch {loadError=error}
        if !document.profiles.contains(where:{$0.bundleID==document.selectedID}) {document.selectedID=document.profiles[0].bundleID}
    }
    var selected: AppProfile { profile(document.selectedID) ?? document.profiles[0] }
    var greeting: Greeting { document.greeting ?? .standard }
    func style(_ theme:String)->[String: Any] { document.styles?[theme]?.dictionary ?? [:] }
    var styles: [String: Any] { (document.styles ?? [:]).mapValues { $0.dictionary } }
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
            ("com.anthropic.claudefordesktop","Claude","ink",true),
            ("com.openai.chat","ChatGPT Classic","frost",false),
            ("com.microsoft.VSCode","Visual Studio Code","terminal",false),
            ("md.obsidian","Obsidian","aurora",false),
            ("ai.opencode.desktop","OpenCode","terminal",false),
            ("com.tinyspeck.slackmacgap","Slack","neon",false)]
        return rows.map {id,name,theme,enabled in
            let path="/Applications/\(name).app"
            let legacy=id=="com.openai.codex" ? UserDefaults.standard.string(forKey:"openingTheme"):nil
            return AppProfile(bundleID:id,name:name,theme:currentTheme(legacy) ?? theme,enabled:enabled,path:FileManager.default.fileExists(atPath:path) ? path:nil)
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
