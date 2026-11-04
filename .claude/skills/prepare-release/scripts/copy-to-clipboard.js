ObjC.import('AppKit');
function run(argv) {
  const read = (p) => {
    const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
    if (s.isNil()) {
      throw new Error(`Cannot read ${p}`);
    }
    return s;
  };
  const html = read(argv[0]);
  const text = read(argv[1]);
  const pb = $.NSPasteboard.generalPasteboard;
  pb.clearContents;
  pb.setStringForType(html, $.NSPasteboardTypeHTML);
  pb.setStringForType(text, $.NSPasteboardTypeString);
}
