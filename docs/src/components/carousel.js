import React from "react";
import { Carousel } from "react-responsive-carousel";
import "react-responsive-carousel/lib/styles/carousel.min.css";

const imageDescripts = {
  outline: [
    ["/1.png", "Outline of a complex part"],
    ["/2.png", "Outline of a non-flat part with inside holes"],
    ["/3.png", "Outside-only outline"],
    ["/4.png", "Inside-only outline"],
  ],
  level: [
    ["/1.png", "Level of a large part"],
    ["/2.png", `Level of a square part's stock`],
    ["/3.png", `Level of a part with a non-uniform top surface`],
  ],
  rough: [
    ["/1.png", "Rough cut of two parts"],
    ["/2.png", "Side-view of a rough cut"],
    ["/3.png", "Rough cut of a part with a complex top surface"],
    ["/4.gif", "Animate of complex rough cut"],
  ],
  contour: [
    ["/1.png", "Close-up of a precise contour"],
    ["/2.png", "Contour of multiple parts at once"],
    ["/3.png", "Low precision contour"],
  ],
  register: [
    ["/1.png", "2-drill register"],
    ["/2.png", "3-drill register"],
    ["/3.png", "Jigsaw register"],
  ],
  drill: [
    ["/1.png", "Drills for a robot baseplate"],
    ["/2.png", "Drills for a pegboard"],
    ["/3.png", "Selecting only matching-size holes"],
  ],
  trace: [
    ["/1.png", "Toolpath tracing a design into a part"],
    ["/2.png", "Selecting loops to trace"],
    ["/3.png", "Tracing edges for deburring"],
    ["/4.png", "Trace to clear a pocket"],
    ["/5.png", "Arbitrary offset outline"],
  ],
  pocket: [
    ["/1.png", "Selecting areas to pocket"],
    ["/2.png", "Toolpath for pocket"],
    ["/3.gif", "Pocket animation"],
    ["/4.png", "Toolpath for v-bit carve"],
    ["/5.png", "Many-pocketed part"],
  ],
  gcode: [["/1.png", "The gcode editor popup"]],
  laserOn: [],
  laserOff: [],
  index: [],
  lathe: [],
  tabs: [
    ["/1.png", "Tabs added to part"],
    ["/2.png", "Sliced part with tabs"],
  ],
  camInterface:[
    ["/1.png", "Empty Ops list"],
    ["/2.png", "Sample Ops list"],
    ["/3.png", "Ops list with history bar"],
  ],
  prefs: [
    ["/prefs-CAM.png", "Preferences in CAM mode"],
    ["/prefs-FDM.png", "Preferences in FDM mode"],
    ["/prefs-LASER.png", "Preferences in laser mode"],
  ],
};

/**
 * A carousel of images.
 *
 * @param {keyof typeof imageDescripts} images - The key to an array of images and descriptions.
 * @returns {ReactElement} - A carousel of the given images.
 */
export function ImageCarousel({ base, images, sml }) {
  return (
    <div className={sml ?"carouselWrapper": ""}>

      <Carousel showThumbs={false}>
        {imageDescripts[images].map(([image, caption], index) => (
          <div>
            <img src={base + image} alt="" />
            <p className="caption">{caption}</p>
          </div>
        ))}
      </Carousel>
    </div>
  );
}
