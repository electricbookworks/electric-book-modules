import { ebToggleClickout } from './utilities'
const settings = process.env.settings
const config = process.env.config

// Prefix for the landing-page accordion open/closed preferences we store in
// localStorage. It has two parts:
//   1. A version tag ('v2'). Bump it (v2 -> v3) to invalidate every previously
//      stored preference at once — old keys stop matching, so getItem falls back
//      to the project default. Used when a past bug wrote incorrect values.
//   2. The book's baseurl (e.g. '/insights'), inlined at build time. Several
//      books can share one origin (e.g. books.core-econ.org/insights,
//      books.core-econ.org/the-economy, ...) and localStorage is per-origin, so
//      without this per-book scope their preferences would overwrite each other.
// Prefer the live baseurl; fall back to the project directory name (inlined at
// build time) so local dev builds, which all share localhost with an empty
// baseurl, still get a unique per-project scope.
const bookScope = (config && config.baseurl) || process.env.projectName || ''
const accordionStoragePrefix = 'accordion-v2-' + bookScope + '-'

/*
ACCORDION BEHAVIOUR ON THE LANDING PAGE
*/

function ebLandingPageAccordionAction (parentClass, parentSection, parentHeading, upArrow, downArrow) {
  parentSection.classList.toggle(parentClass + '-open')
  parentSection.classList.toggle(parentClass + '-closed')
  upArrow.classList.toggle('visuallyhidden')
  downArrow.classList.toggle('visuallyhidden')

  const storageKey = accordionStoragePrefix + parentHeading.id

  if (parentSection.classList.contains(parentClass + '-open')) {
    window.localStorage.setItem(storageKey, 'open')
  } else {
    window.localStorage.setItem(storageKey, 'closed')
  }
}

function ebLandingPageAccordionStart (parentClass, parentSection, parentHeading, upArrow, downArrow) {
  // Get the project's default visual-TOC position (from _data/settings.yml)
  const defaultPosition = settings[process.env.output]['landing-page']['visual-toc-accordion-default'] === 'open' ? 'open' : 'closed'

  // The desired state is the user's saved choice from a previous visit,
  // or the project default when they haven't set one yet.
  const storageKey = accordionStoragePrefix + parentHeading.id
  const desiredPosition = window.localStorage.getItem(storageKey) || defaultPosition

  // The current state is whatever the server-rendered markup shipped.
  const currentPosition = parentSection.classList.contains(parentClass + '-open') ? 'open' : 'closed'

  // Only toggle when the desired state differs from what's already on screen.
  // Comparing against the current state (rather than blindly toggling) avoids
  // flipping the section on a first visit, when no preference is stored.
  if (desiredPosition !== currentPosition) {
    ebLandingPageAccordionAction(parentClass, parentSection, parentHeading, upArrow, downArrow)
  }
}

function ebLandingPageAccordion () {
  // Get the accordion buttons on the landing page
  const landingPageAccordionButtons = document.querySelectorAll('.landing-page-accordion-head')

  if (landingPageAccordionButtons) {
    landingPageAccordionButtons.forEach(function (button) {
      //
      const parentSection = button.closest('.landing-page-toc-section, .landing-page-flex-section')
      const parentClass = parentSection.classList.contains('landing-page-toc-section') ? 'landing-page-toc-section' : 'landing-page-flex-section'
      const parentHeading = button.closest('h2, h3')
      const upArrow = button.querySelector('.arrow-up')
      const downArrow = button.querySelector('.arrow-down')

      // If the user has visited the page before, get the page looking how they left it
      ebLandingPageAccordionStart(parentClass, parentSection, parentHeading, upArrow, downArrow)

      // Listen for clicks to open and close sections
      button.addEventListener('click', function () {
        ebLandingPageAccordionAction(parentClass, parentSection, parentHeading, upArrow, downArrow)
      })
    })
  }
}

/*
NAV BEHAVIOUR ON THE LANDING PAGE
*/

function ebLandingPageNavLinks (navElement) {
  if (!navElement) {
    return
  }
  const navLinks = navElement.querySelectorAll('a')
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      ebToggleClickout(navElement, function () {
        navElement.classList.toggle('invisible')
        ebLandingPageNavToggleAccess(navElement)
      })
    })
  })
}

function ebLandingPageNavToggleAccess (navElement) {
  if (!navElement) {
    return
  }
  // Nav elements that are not visible should not be keyboard accessible
  const navItems = navElement.querySelectorAll('input.search-box, a')
  if (navElement.classList.contains('invisible')) {
    navItems.forEach(function (item) {
      item.setAttribute('tabindex', '-1')
    })
  } else {
    navItems.forEach(function (item) {
      item.setAttribute('tabindex', '0')
    })
  }
}

function ebLandingPageNavKeyboardAccess (navButton, navElement) {
  if (!navButton || !navElement) {
    return
  }
  const navButtonSVG = navButton.querySelector('svg')
  const navButtonStyles = window.getComputedStyle(navButtonSVG)

  if (navButtonStyles.display === 'none') {
    // WIDE SCREEN
    // Hamburger is inaccessible
    navButton.setAttribute('tabindex', '-1')
    // Nav elements are accessible by default
  } else {
    // NARROW SCREEN
    // Hamburger is accessible
    navButton.setAttribute('tabindex', '0')
    // Nav elements are inaccessible to begin with
    // since nav list is invisible to begin with
    ebLandingPageNavToggleAccess(navElement)

    // Visibility and access to nav items is toggled
    navElement.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        ebToggleClickout(navElement, function () {
          navElement.classList.toggle('invisible')
          ebLandingPageNavToggleAccess(navElement)
        })
      }
    })

    // Listen for clicks on the nav child links
    ebLandingPageNavLinks(navElement)

    // Listen for clicks on the hamburger button
    navButton.addEventListener('click', function () {
      // Toggle the visibility of the nav and the clickout region
      ebToggleClickout(navElement, function () {
        navElement.classList.toggle('invisible')
        ebLandingPageNavToggleAccess(navElement)
      })
    })
  }
}

function ebLandingPageNav () {
  // Check whether we're on the landing page
  if (document.querySelector('.landing-page')) {
    const navButton = document.querySelector('button.masthead-menu')
    const navElement = document.getElementById('landing-page-nav')
    if (navButton && navElement) {
      ebLandingPageNavKeyboardAccess(navButton, navElement)
    }
  }
}

/*
LANGUAGE SWITCHER ON THE LANDING PAGE
*/

function ebLandingPageLanguageSwitcher () {
  // Check whether we're on the landing page
  if (document.querySelector('.landing-page') && document.querySelector('select#translations')) {
    const languageSelector = document.querySelector('select#translations')
    if (!languageSelector) {
      return
    }
    // Add an event listener
    languageSelector.addEventListener('input', function () {
      const selectedOption = languageSelector.options[languageSelector.selectedIndex]
      const newPath = selectedOption.getAttribute('data-path')

      // Construct the new href from the existing one
      const origin = new URL(window.location.href).origin
      const destination = origin + newPath

      // Reassigning window.location.href navigates to that new href
      window.location.href = destination
    })
  }
}

export default function ebLandingPage () {
  ebLandingPageAccordion()
  ebLandingPageNav()
  ebLandingPageLanguageSwitcher()
}
