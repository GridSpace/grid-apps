import React from 'react';
import { Carousel } from 'react-responsive-carousel';
import 'react-responsive-carousel/lib/styles/carousel.min.css';


const imageDescripts= {
  outline:[
    [ '/1.png', 'outline of a complex part'],
    [ '/2.png', 'outline of a non-flat part with inside holes'],
    [ '/3.png', 'outside-only outline'],
    [ '/4.png', 'inside-only outline'],
  ],
  level:[
    [ '/1.png', 'level of a large part'],
    [ '/2.png', `level of a square part's stock`],
    [ '/3.png', `level of a part with a non-uniform top surface`],
  ],
  rough:[
    [ '/1.png', 'rough cut of two parts'],
    [ '/2.png', 'side-view of a rough cut'],
    [ '/3.png', 'rough cut of a part with a complex top surface'],
    [ '/4.gif', 'animate of complex rough cut'],
  ],
  contour:[
    [ '/1.png', 'close-up of a precise contour'],
    [ '/2.png', 'contour of multiple parts at once'],
    [ '/3.png', 'low precision contour'],
  ]
}


/**
 * A carousel of images.
 *
 * @param {keyof typeof imageDescripts} images - The key to an array of images and descriptions.
 * @returns {ReactElement} - A carousel of the given images.
 */
export function ImageCarousel({base,images}) {
  console.log(base,images);
  return (
    <Carousel showThumbs={false} >
      {imageDescripts[images].map(([image,caption], index) => (
        
      <div>
        <img src={base+image} alt="" />
        <p className="caption">{caption}</p>
      </div>
      ))}
      
    </Carousel>
  );
}