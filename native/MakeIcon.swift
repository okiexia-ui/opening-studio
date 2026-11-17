import AppKit
let output=CommandLine.arguments[1]
let image=NSImage(size:NSSize(width:1024,height:1024))
image.lockFocus()
let outer=NSBezierPath(roundedRect:NSRect(x:64,y:64,width:896,height:896),xRadius:204,yRadius:204)
NSColor(calibratedRed:0.16,green:0.17,blue:0.15,alpha:1).setFill();outer.fill()
let colors:[NSColor]=[NSColor(calibratedRed:0.79,green:0.71,blue:0.56,alpha:1),NSColor(calibratedRed:0.90,green:0.84,blue:0.72,alpha:1),NSColor(calibratedRed:0.74,green:0.36,blue:0.32,alpha:1)]
for i in 0..<3 {
 let inset=CGFloat(i)*99
 let p=NSBezierPath();p.move(to:NSPoint(x:246+inset,y:280));p.line(to:NSPoint(x:246+inset,y:750-inset));p.line(to:NSPoint(x:778-inset,y:750-inset));p.line(to:NSPoint(x:778-inset,y:280));p.lineWidth=22;p.lineCapStyle = .round;p.lineJoinStyle = .round;colors[i].setStroke();p.stroke()
}
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output))
