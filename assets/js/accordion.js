/*
global Element, HTMLDocument, Node, MutationObserver, history
*/

import { locales, pageLanguage } from './locales'
import { ebLazyLoadImages } from './lazyload'
import { ebVideoShow } from './videos'
const settings = process.env.settings

// --------------------------------------------------------------
// Options
//
// 1. Use CSS selectors to list the headings that will
//    define each accordion section, e.g. '#content h2'
//    Read the configured level, then verify it's a real heading tag (h1–h6).
//    Anything missing or malformed (e.g. 'h7', '3', true) falls back to 'h2'.
const configuredLevel = settings[process.env.output]?.accordion?.level
const headingLevel = /^h[1-6]$/.test(configuredLevel) ? configuredLevel : 'h2'

//    Derive the subheading level as one level below the heading level,
//    e.g. 'h2' -> 'h3' and 'h4' -> 'h5'. We strip the 'h', add 1 to the
//    number, and cap at 6 (the deepest HTML heading level).
const headingLevelNumber = parseInt(headingLevel.replace('h', ''), 10)
const subheadingLevel = 'h' + Math.min(headingLevelNumber + 1, 6)
const accordionHeads = '.content > ' + headingLevel

// 2. Which heading's section should we show by default?
const defaultAccordionHead = '.content > ' + headingLevel + ':first-of-type'

// 3. Auto close last accordion when you open a new one?
const autoCloseAccordionSections = false

// Unique key for storing last-opened section on this page
const storageKey = window.location.pathname + '-accordion'
// --------------------------------------------------------------

function ebAccordionInit () {
  return navigator.userAgent.indexOf('Opera Mini') === -1 &&
    document.querySelectorAll !== 'undefined' &&
    window.addEventListener !== 'undefined' &&
    !!Array.prototype.forEach &&
    !ebAccordionIsPageOff()
}

function ebAccordionPageSetting () {
  return document.body.querySelector('.wrapper').getAttribute('data-accordion-page')
}

export function ebAccordionIsPageOff () {
  const accordionPageSetting = ebAccordionPageSetting()

  // A page that sets `accordion: true` (emitted as data-accordion-page="true")
  // opts in explicitly. We check this first and at runtime, so the page
  // override still works even when the project-level setting was compiled into
  // the bundle as `false`. process.env.settings is inlined by webpack at build
  // time, so if the project setting were consulted first, a `false` value would
  // let the minifier constant-fold this whole function to "always off" and
  // strip out the page check entirely.
  if (accordionPageSetting === 'true') {
    return false
  }

  // No page opt-in, so fall back to the original rule: the accordion is off
  // when the project disables it in _data/settings.yml, or when the page hasn't
  // opted in with 'true'.
  const accordionProjectSetting = process.env.settings[process.env.output]?.accordion?.enabled
  return accordionProjectSetting === false || accordionPageSetting !== 'true'
}

function ebAccordionOpenFirstSetting () {
  // Should the first section be open by default?
  // A page's `accordion-open-first` frontmatter (emitted as
  // data-accordion-open-first) overrides the project-level setting
  // settings[output].accordion.open-first in _data/settings.yml.
  const pageSetting = document.body
    .querySelector('.wrapper')
    .getAttribute('data-accordion-open-first')

  if (pageSetting === 'true') {
    return true
  }
  if (pageSetting === 'false') {
    return false
  }

  // No page-level override, so fall back to the project setting
  return process.env.settings[process.env.output]?.accordion?.['open-first'] === true
}

// function ebAccordionDefaultAccordionHeadID () {
//   'use strict'

//   let defaultAccordionHeadID

//   // Get the default accordion section's ID
//   if (defaultAccordionHead !== '') {
//     defaultAccordionHeadID = document.querySelector(defaultAccordionHead).id
//     if (!defaultAccordionHeadID) {
//       defaultAccordionHeadID = 'defaultAccordionSection'
//     }
//   }
//   return defaultAccordionHeadID
// }

function ebAccordionSetUpSections (sectionHeadings) {
  // Loop through sectionHeadings, rearranging elements
  // to create an accessible accordion with sections
  // that look like this:

  // <h2>
  //     <button id="header-title..." aria-controls="section-title...">
  //         <span>Section title</span>
  //         <span>+</span>
  //     </button>
  // </h2>
  // <section id="section-title..." aria-labelledby="header-title...">
  //     Section content
  // </section>

  sectionHeadings.forEach(function (sectionHeading) {
    // Get the ID of the heading
    const headingID = sectionHeading.id

    // Create a button element to put inside the heading
    const headingButton = document.createElement('button')
    headingButton.setAttribute('id', 'header-' + headingID)
    headingButton.setAttribute('aria-expanded', 'false')
    headingButton.setAttribute('aria-controls', 'section-' + headingID)
    headingButton.classList.add('accordion-toggle')

    // Move the heading text into a span
    const headingSpan = document.createElement('span')
    headingSpan.innerHTML = sectionHeading.innerHTML
    sectionHeading.innerHTML = ''

    // Move the text span into the button
    headingButton.appendChild(headingSpan)

    // Move the button into the heading
    sectionHeading.appendChild(headingButton)

    // Add a +/- indicator to show open/closed section
    const expandedIndicator = document.createElement('span')
    expandedIndicator.setAttribute('aria-hidden', 'true')
    expandedIndicator.innerHTML = '+'

    headingButton.appendChild(expandedIndicator)

    // Create a section element to correspond with the heading
    const contentSection = document.createElement('section')
    contentSection.setAttribute('id', 'section-' + headingID)
    contentSection.setAttribute('aria-labelledby', 'header-' + headingID)
    contentSection.setAttribute('aria-hidden', 'true')

    // Now we have the heading and all its children, and an empty section
    // The heading is still where it should be in the DOM,
    // so we can put the section after it
    sectionHeading.insertAdjacentElement('afterend', contentSection)

    // Add label to section heading so that it's not "empty"
    sectionHeading.setAttribute('aria-labelledby', 'header-' + headingID)
    sectionHeading.classList.add('accordion-header')
  })

  ebAccordionFillSections()
  ebAccordionShowAllButton()
}

function ebAccordionFillSections () {
  // Grab the individual #contents elements of the page
  const contentItems = document.querySelector('.content').childNodes

  // Put all the items in an array, selecting only
  // elements and text items that match the mathjax \[ pattern.
  let j; const contentItemsForSections = []
  for (j = 0; j < contentItems.length; j += 1) {
    if (contentItems[j].nodeType === Node.ELEMENT_NODE) {
      contentItemsForSections.push(contentItems[j])
    } else if (contentItems[j].nodeValue.includes('[')) {
      contentItemsForSections.push(contentItems[j])
    }
  }

  // We don't know where our first section is yet
  let currentSection = false

  // Loop through the content to accordify
  contentItemsForSections.forEach(function (contentItem) {
    // If this is an element (not a text or comment node), and
    // if this is a section, update currentSection, then move on
    if (contentItem.nodeType === Node.ELEMENT_NODE) {
      if (contentItem.nodeName === 'SECTION' && contentItem.hasAttribute('aria-labelledby')) {
        currentSection = contentItem
        return
      }
    }

    // Have we reached the first section yet? If not, move on
    if (!currentSection) {
      return
    }

    // Leave the headings outside the section
    if (contentItem.nodeName.toLowerCase() === headingLevel) {
      return
    }

    // Leave the pagination arrows outside the section
    if (contentItem.classList && contentItem.classList.contains('pagination')) {
      return
    };

    // Otherwise, move the element inside the section
    currentSection.appendChild(contentItem)
  })
}

function ebAccordionCloseSection (heading) {
  // Given a heading element, apply all the changes needed
  // to close the corresponding section

  heading.querySelector('button').setAttribute('aria-expanded', 'false')
  heading.querySelector('span[aria-hidden]').innerHTML = '+'

  const section = heading.nextElementSibling
  section.setAttribute('aria-hidden', 'true')
}

function ebAccordionOpenSection (heading) {
  // Given a heading element, apply all the changes needed
  // to open the corresponding section

  heading.querySelector('button').setAttribute('aria-expanded', 'true')
  heading.querySelector('span[aria-hidden]').innerHTML = '–'

  const section = heading.nextElementSibling
  section.setAttribute('aria-hidden', 'false')
}

function ebAccordionHideThisSection (targetID) {
  const heading = document.getElementById(targetID)

  ebAccordionCloseSection(heading)
}

function ebAccordionHideAll () {
  const headings = document.querySelectorAll(accordionHeads)

  headings.forEach(function (heading) {
    ebAccordionCloseSection(heading)
  })
}

function ebAccordionShowAll () {
  const headings = document.querySelectorAll(accordionHeads)

  headings.forEach(function (heading) {
    ebAccordionOpenSection(heading)
  })
}

function ebAccordionOpenFirstSection () {
  // Open the first accordion section, leaving the others closed.
  // accordionHeads is '.content > h2', so querySelector returns the
  // first heading, and ebAccordionOpenSection opens its sibling section.
  const firstHeading = document.querySelector(accordionHeads)
  if (firstHeading) {
    ebAccordionOpenSection(firstHeading)

    // Lazyload the images inside the section we just auto-opened.
    // ebAccordionOpenSection only toggles visibility, so without this
    // the first section's data-src images are never converted to src
    // (unlike ebAccordionShow, which lazyloads the sections it opens).
    // Select [data-src] (not just [data-srcset]) so images without a
    // srcset are converted too.
    const firstSection = firstHeading.nextElementSibling
    if (firstSection) {
      const lazyimages = firstSection.querySelectorAll('[data-src]')
      if (lazyimages.length > 0) {
        ebLazyLoadImages(lazyimages)
      }
    }
  }
}

function ebAccordionHideAllExceptThisOne (targetID) {
  const headings = document.querySelectorAll(accordionHeads)

  headings.forEach(function (heading) {
    // iIf it's the one we just clicked, skip it
    if (heading.id === targetID) {
      return
    }

    // Otherwise, hide it
    ebAccordionCloseSection(heading)
  })
}

function ebAccordionCheckParent (node) {
  // If there is no parent, or something went wrong, exit
  if (!node) {
    return false
  }

  if (!node.parentNode) {
    return false
  }

  // If the parent is the body element, exit
  if (node.tagName === 'BODY') {
    return false
  }

  // If it is an accordion section, return its ID
  if (node.nodeName === 'SECTION') {
    return node.id
  }

  // If it's an accordion heading, return the ID of the
  // corresponding accordion section
  if (node.nodeName.toLowerCase() === headingLevel) {
    return 'section-' + node.id
  }

  // If it has a parent, check whether that parent is
  // an accordion section, and return its ID
  const nodeParent = node.parentNode
  const parentIsSection = (nodeParent.nodeName === 'SECTION')
  if (parentIsSection) {
    return nodeParent.id
  }

  // Else, recurse upwards
  return ebAccordionCheckParent(nodeParent)
}

function ebAccordionFindSection (targetToCheck) {
  // Find and return containing section

  // Work recursively up the DOM looking for the section
  return ebAccordionCheckParent(targetToCheck)
}

function ebWhichTarget (targetID) {
  let targetToCheck

  if (targetID) {
    // If we're given an ID, use it
    // Decode the targetID URI in case it's not ASCII
    targetID = decodeURIComponent(targetID)

    targetToCheck = document.getElementById(targetID)
  } else {
    // Else use the hash
    let trimmedHash = window.location.hash.replace('#', '')

    // Decode the trimmedHash in case it's not ASCII
    trimmedHash = decodeURIComponent(trimmedHash)

    targetToCheck = document.getElementById(trimmedHash)
  }

  // If the ID doesn't exist, exit
  if (!targetToCheck) {
    return false
  }

  return targetToCheck
}

function ebAccordionShow (targetID) {
  const targetToCheck = ebWhichTarget(targetID)

  if (!targetToCheck) {
    return
  }

  const sectionID = ebAccordionFindSection(targetToCheck)
  const previousID = ebAccordionRetrieveLastView(storageKey)

  // If we are not linking to a section or something inside it
  if (!sectionID) {
    // Check whether we've got a previous location stored

    if (previousID) {
      const previousTarget = document.getElementById(previousID)

      if (previousTarget && ebAccordionFindSection(previousTarget)) {
        const location = window.location.toString().split('#')[0]
        history.replaceState(null, null, location + '#' + previousID)
        ebAccordionShow(previousID)
      }
    } else {
      // Otherwise close everything
      ebAccordionHideAll()
    }
  }

  // Show and load the contents of the section
  const sectionToShow = document.getElementById(sectionID)
  if (sectionToShow) {
    const heading = sectionToShow.previousElementSibling

    ebAccordionOpenSection(heading)

    // Lazyload the images inside
    const lazyimages = sectionToShow.querySelectorAll('[data-srcset]')
    if (lazyimages.length > 0) {
      ebLazyLoadImages(lazyimages)
    }

    // If we have a slideline in this section, check if it's a portrait one
    const slidelinesInThisSection = sectionToShow.querySelectorAll('.slides')

    slidelinesInThisSection.forEach(function (slidelineInThisSection) {
      const firstFigureImg = slidelineInThisSection.querySelector('.figure img')

      if (firstFigureImg) {
        firstFigureImg.addEventListener('load', function () {
          const portraitSlideline = (firstFigureImg.height > firstFigureImg.width)
          if (portraitSlideline) {
            slidelineInThisSection.querySelector('nav').classList.add('nav-slides-portrait')
          }
        })
      }
    })

    if (typeof (ebVideoShow) === 'function') {
      ebVideoShow(sectionToShow)
    }

    // Scroll to target that triggered section opening
    const targetElement = document.getElementById(targetID)
    if (targetElement) {
      window.setTimeout(() => {
        targetElement.scrollIntoView({ behavior: 'instant' })
      }, 1)
    }
  }
}

function ebAccordionListenForAnchorClicks () {
  // Listen for clicks on *all* the anchors (;_;)
  const allTheAnchors = document.querySelectorAll('#content a[href], .search-results-nav a[href]')
  allTheAnchors.forEach(function (oneOfTheAnchors) {
    // If it's an external link, exit
    if (oneOfTheAnchors.target === '_blank') {
      return
    }

    oneOfTheAnchors.addEventListener('click', function (event) {
      event.stopPropagation()

      // Declare targetID so JSLint knows it's coming in this function.
      let targetID

      // Ignore target blank / rel noopener links
      if (event.target.getAttribute('rel') === 'noopener') {
        return
      }

      // Get the target ID by removing any file path and the #
      if (event.target.hasAttribute('href')) {
        targetID = event.target.getAttribute('href').replace(/.*#/, '')
      } else {
        return
      }

      // Find the target of the link in the DOM
      const targetOfLink = document.getElementById(targetID)

      // Recursively update targetID until we have an accordion section
      targetID = ebAccordionFindSection(targetOfLink)

      // Now open the right closed accordion
      ebAccordionShow(targetID)
      if (autoCloseAccordionSections === true) {
        ebAccordionHideAllExceptThisOne(targetID)
      }

      // Once we've opened the correct accordion section, check whether
      // the target is inside an expandable box, and if yes, expand that box
      if (targetOfLink.closest('.expandable-box')) {
        const expandableParent = targetOfLink.closest('.expandable-box')
        const boxHeader = expandableParent.querySelector('h3 strong, h4 strong, h5 strong, h6 strong')
        const boxHeaderToggle = boxHeader.querySelector('.toggle')
        boxHeaderToggle.click()
      }
    })
  })
}

function ebChangeHashOnScroll () {
  // When we scroll past a subheading (e.g. Unit number h3 in the Figures section
  // of the Features list) change the hash of the URL so that we can easily
  // navigate back to this heading in the browser
  // https://stackoverflow.com/questions/58127310/how-to-update-url-hash-on-scroll-with-table-of-contents

  const subheadings = document.querySelectorAll(subheadingLevel)

  document.addEventListener('scroll', function () {
    subheadings.forEach(h3 => {
      const rect = h3.getBoundingClientRect()
      if (rect.top > 0 && rect.top < 150) {
        const location = window.location.toString().split('#')[0]
        history.replaceState(null, null, location + '#' + h3.id)
        ebAccordionStoreLastView(h3.id)
      }
    })
  })
}

function ebAccordionListenForHeadingClicks () {
  // Expand an accordion section if its heading is clicked
  const headings = document.querySelectorAll(accordionHeads)
  headings.forEach(function (heading) {
    heading.addEventListener('click', function () {
      const button = heading.querySelector('button')
      if (button.getAttribute('aria-expanded') === 'true') {
        ebAccordionHideThisSection(heading.id)
      } else {
        // Change the URL hash to reflect this new target
        const location = window.location.toString().split('#')[0]
        history.replaceState(null, null, location + '#' + heading.id)
        // Open that section
        ebAccordionShow(heading.id)
        ebAccordionStoreLastView(heading.id)
      }
    })
  })
}

function ebAccordionListenForNavClicks () {
  // Also listen for nav clicks
  const navLinks = document.querySelectorAll('#nav [href]')

  navLinks.forEach(function (navLink) {
    navLink.addEventListener('click', function (event) {
      // Get the section and click to open it if it's closed
      const theHeading = document.getElementById(event.target.hash.replace(/.*#/, ''))

      // Simulate anchor click, if it's closed
      if (theHeading) {
        if (theHeading.querySelector('button').getAttribute('aria-expanded') === 'false') {
          theHeading.click()
        }
      }
    })
  })
}

function ebAccordionListenForHashChange () {
  window.addEventListener('hashchange', function (event) {
    // Don't treat this like a normal click on a link
    event.preventDefault()

    // Get the target ID from the hash
    let targetID = window.location.hash
    targetID = decodeURIComponent(targetID)

    // Get the target of the link
    const targetOfLink = document.getElementById(targetID.replace(/.*#/, ''))
    const isAccordionHeader = targetOfLink && targetOfLink.classList.contains('accordion-header')

    // If it's not an accordion header, then exit
    if (!isAccordionHeader) {
      return
    }

    // If it's an accordion and it's closed, open it / jump to it
    const targetAccordionToggle = targetOfLink.querySelector('.accordion-toggle')
    if (targetAccordionToggle && targetAccordionToggle.getAttribute('aria-expanded') === 'false') {
      targetOfLink.click()
      return
    }

    // Otherwise, open the appropriate accordion
    const targetAccordionID = ebAccordionFindSection(targetOfLink)

    ebAccordionShow(targetAccordionID)

    if (autoCloseAccordionSections === true) {
      ebAccordionHideAllExceptThisOne(targetAccordionID)
    }

    // Now that the target is visible, scroll to it
    targetOfLink.scrollIntoView()
  })
}

function ebAccordionStoreLastView (targetID) {
  // Determine the last URL hash the user viewed on this page, and store this
  // in sessionStorage, so that they have their last section pre-opened when
  // they revisit this page.
  window.sessionStorage.setItem(storageKey, targetID)
}

function ebAccordionRetrieveLastView () {
  // Get the ID of the last-viewed section of this page
  return window.sessionStorage.getItem(storageKey)
}

// function ebAccordionShowDefaultSection () {
//   'use strict'
//   ebAccordionHideAllExceptThisOne(ebAccordionDefaultAccordionHeadID())
//   ebAccordionShow(ebAccordionDefaultAccordionHeadID())
// }

function ebAccordionCloseAllButton () {
  const button = document.querySelector('.accordion-show-all-button')
  button.innerHTML = locales[pageLanguage].accordion['close-all']

  // Close all when clicked
  button.addEventListener('click', function () {
    ebAccordionHideAll()
    ebAccordionShowAllButton()
  })
  // Close all when keyboard is used
  button.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      ebAccordionHideAll()
      ebAccordionShowAllButton()
    }
  })
}

function ebAccordionShowAllButton () {
  let button
  if (document.querySelector('.accordion-show-all-button')) {
    button = document.querySelector('.accordion-show-all-button')
    button.innerHTML = locales[pageLanguage].accordion['show-all']
  } else {
    const firstSection = document.querySelector(defaultAccordionHead)

    if (firstSection) {
      // Create a wrapper for the button
      const buttonWrapper = document.createElement('div')
      buttonWrapper.classList.add('accordion-show-all-button-wrapper')
      firstSection.insertAdjacentElement('beforebegin', buttonWrapper)

      // Create the button link
      button = document.createElement('a')
      button.classList.add('accordion-show-all-button')
      button.innerHTML = locales[pageLanguage].accordion['show-all']
      button.setAttribute('tabindex', '0')
      buttonWrapper.insertAdjacentElement('afterbegin', button)
    }
  }

  if (button instanceof Element || button instanceof HTMLDocument) {
    // Show all when clicked
    button.addEventListener('click', function () {
      ebAccordionShowAll()
      ebAccordionCloseAllButton()
    })
    // Show all when keyboard access is used
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        ebAccordionShowAll()
        ebAccordionCloseAllButton()
      }
    })
  }
}

function ebAccordify () {
  // Early exit for older browsers
  if (!ebAccordionInit()) {
    return
  }

  document.body.setAttribute('data-accordion-active', 'true')

  // Exit if there are one or no headings
  const sectionHeadings = document.querySelectorAll(accordionHeads)
  if (sectionHeadings.length < 2) {

    // Turn off the accordion on this page
    // to avoid CSS that expects accordion layout
    document.querySelector("div.wrapper").setAttribute("data-accordion-page", false)

    // Stop accordifying
    return
  }

  // Exit if this isn't a chapter
  const thisIsFrontmatter = (document.querySelector('.wrapper').classList.contains('frontmatter-page'))
  const thisIsNotAChapter = !(document.querySelector('.wrapper').classList.contains('default-page'))
  const thisHasNoH2s = (document.querySelector(accordionHeads) === null)
  const thisIsEndmatter = (document.querySelector('.wrapper').classList.contains('endmatter-page'))
  if (thisIsFrontmatter || thisIsNotAChapter || thisHasNoH2s || thisIsEndmatter) {
    // override if accordion is set to true for the page
    const thisPageHasAccordionProperty = (document.querySelector('.wrapper[data-accordion-page]'))
    if (!thisPageHasAccordionProperty) {
      return
    }
  }

  ebAccordionSetUpSections(sectionHeadings)

  ebAccordionShowAllButton()

  if (!window.location.hash) {
    // Default view is all sections closed...
    ebAccordionHideAll()

    // ...unless open-first is enabled, in which case open the first section
    if (ebAccordionOpenFirstSetting()) {
      ebAccordionOpenFirstSection()
    }
  } else {
    // If there is a URL hash, open up the section that it corresponds to
    // and close all the other sections
    const targetID = window.location.hash.split('#')[1]
    ebAccordionHideAll()
    ebAccordionShow(targetID)
  }
}

function ebExpand () {
  // Check for expand-accordion setting on page
  if (ebAccordionPageSetting() === 'expand') {
    ebAccordionShowAll()
  }
}

function ebLoadAccordion () {
  if (ebAccordionInit()) {
    ebAccordify()
    ebExpand()
    ebAccordionListenForAnchorClicks()
    ebAccordionListenForHeadingClicks()
    ebAccordionListenForNavClicks()
    ebChangeHashOnScroll()
    ebAccordionListenForHashChange()
  }
}

function ebCheckAccordionReady () {
  return (document.body.getAttribute('data-accordion-active') !== 'true' &&
  (document.body.getAttribute('data-index-targets') !== null || settings['dynamic-indexing'] === false) &&
  document.body.getAttribute('data-ids-assigned') !== null)
}

// Wait for data-index-targets to be loaded
// and IDs to be assigned, and any search results to be loaded,
// before applying the accordion.
function ebPrepareForAccordion () {
  if (ebCheckAccordionReady()) {
    // If the requirements are already met, just go ahead
    ebLoadAccordion()
  } else {
    // Otherwise wait for the requirements
    const accordionObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') {
          if (ebCheckAccordionReady()) {
            ebLoadAccordion()
          }
        }
      })
    })

    accordionObserver.observe(document.body, {
      attributes: true // Listen for attribute changes
    })
  }
}

export default function ebAccordion () {
  window.onload = ebPrepareForAccordion()
}

export {
  ebAccordionListenForAnchorClicks
}
