import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";

const imageDescripts = {
  outline: [
    ["/1.png", "outline of a complex part"],
    ["/2.png", "outline of a non-flat part with inside holes"],
    ["/3.png", "outside-only outline"],
    ["/4.png", "inside-only outline"],
  ],
  level: [
    ["/1.png", "level of a large part"],
    ["/2.png", `level of a square part's stock`],
    ["/3.png", `level of a part with a non-uniform top surface`],
  ],
  rough: [
    ["/1.png", "rough cut of two parts"],
    ["/2.png", "side-view of a rough cut"],
    ["/3.png", "rough cut of a part with a complex top surface"],
    ["/4.gif", "animate of complex rough cut"],
  ],
  contour: [
    ["/1.png", "close-up of a precise contour"],
    ["/2.png", "contour of multiple parts at once"],
    ["/3.png", "low precision contour"],
  ],
  register: [
    ["/1.png", "2-drill register"],
    ["/2.png", "3-drill register"],
    ["/3.png", "jigsaw register"],
  ],
  drill: [
    ["/1.png", "drills for a robot baseplate"],
    ["/2.png", "drills for a pegboard"],
    ["/3.png", "selecting only matching-size holes"],
  ],
  trace: [
    ["/1.png", "toolpath tracing a design into a part"],
    ["/2.png", "selecting loops to trace"],
    ["/3.png", "tracing edges for deburring"],
    ["/4.png", "trace to clear a pocket"],
    ["/5.png", "arbitrary offset outline"],
  ],
  pocket: [
    ["/1.png", "selecting areas to pocket"],
    ["/2.png", "toolpath for pocket"],
    ["/3.gif", "pocket animation"],
    ["/4.png", "toolpath for v-bit carve"],
    ["/5.png", "many-pocketed part"],
  ],
  gcode: [["/1.png", "the gcode editor popup"]],
  laserOn: [],
  laserOff: [],
  index: [],
  lathe: [],
  tabs: [
    ["/1.png", "tabs added to part"],
    ["/2.png", "sliced part with tabs"],
  ],
};

/**
 * A carousel of images.
 *
 * @param {keyof typeof imageDescripts} images - The key to an array of images and descriptions.
 * @returns {ReactElement} - A carousel of the given images.
 */
export function ImageCarousel({ base, images }) {
  return (
    <Carousel showThumbs={false}>
      {imageDescripts[images].map(([image, caption], index) => (
        <div>
          <img src={base + image} alt="" />
          <p className="caption">{caption}</p>
        </div>
      ))}
    </Carousel>
  );
}
