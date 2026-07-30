import SVGInject from '@iconfu/svg-inject'
import { ebAccordionIsPageOff } from './accordion'

const ebLazyLoadImages = function (lazyImages) {
  if (!Array.prototype.forEach) return

  lazyImages.forEach(function (lazyImage) {
    // if there's a noscript before our image, remove it
    const lazySibling = lazyImage.previousElementSibling
    if (lazyImage.previousElementSibling) {
      if (lazySibling.tagName.toLowerCase() === 'noscript') {
        lazySibling.parentNode.removeChild(lazyImage.previousElementSibling)
      }
    }

    // set the src to data-src, then remove data-src
    const newSrc = lazyImage.getAttribute('data-src')

    // if there's no data-src (e.g. we've already run lazyload) return
    if (!newSrc) return

    lazyImage.setAttribute('src', newSrc)
    lazyImage.removeAttribute('data-src')

    // if srcset is supported, add it
    if ('srcset' in document.createElement('img') && lazyImage.getAttribute('data-srcset') !== null) {
      const srcset = lazyImage.getAttribute('data-srcset')
      lazyImage.setAttribute('srcset', srcset)
      lazyImage.removeAttribute('data-srcset')
    }

    // If the images are SVGs, now inject them
    if (lazyImage.classList.contains('inject-svg')) {
      SVGInject(lazyImage)
    }
  })
}

export default function ebLazyLoad () {
  if (process.env.settings[process.env.output]?.images?.lazyload) {
    if ('querySelectorAll' in document) {
      // accordions lazy load when they open
      // so only lazy load images on non-accordion pages
      if (ebAccordionIsPageOff()) {
        const lazyImages = document.querySelectorAll('[data-src]')
        ebLazyLoadImages(lazyImages)
      }
    }
    // if there's a chapter-opener-image, lazyload it
    if ('querySelectorAll' in document) {
      const chapterOpenerImages = document.querySelectorAll('.chapter-opener-image [data-src]')
      if (chapterOpenerImages) {
        ebLazyLoadImages(chapterOpenerImages)
      }
    }
  }
}

export { ebLazyLoadImages }
