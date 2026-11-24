import React from "react";
// Stand-in for react-avatar-editor (not installable in the sandbox): same ref API, draws a grey square.
// The real crop/zoom/drag behaviour is NOT exercised by the smoke test.
const AvatarEditor = React.forwardRef(({ width = 256, height = 256, image }, ref) => {
  React.useImperativeHandle(ref, () => ({
    getImageScaledToCanvas: () => {
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      const x = c.getContext("2d"); x.fillStyle = "#789"; x.fillRect(0, 0, width, height);
      return c;
    },
  }));
  return <canvas data-stub="avatar-editor" data-image={image?.name} width={width} height={height} />;
});
export default AvatarEditor;
