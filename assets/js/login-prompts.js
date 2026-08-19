/* globals MutationObserver */

import { ebGetWPUserSession } from './wordpress-user-profile'

export default function ebLoginPrompts () {
  // Change the content of the notification close button label
  function ebChangeCloseButton () {
    const closeButtons = document.querySelectorAll('.notification.login-prompt label')

    if (closeButtons) {
      closeButtons.forEach(function (button) {
        button.innerHTML = '╳'
      })
    }
  }

  ebChangeCloseButton()

  async function ebDisplayLoginPrompts () {
    const sidebarLoginPrompt = document.querySelector('.sidebar-login-prompt')
    const userSession = await ebGetWPUserSession()

    if (!userSession) {
      if (sidebarLoginPrompt && document.body.classList.contains('home')) {
        sidebarLoginPrompt.classList.remove('visuallyhidden')
      }
    }

    // Then, always show the prompts inside in instructors-preview view
    if (process.env.config.view === 'instructors-preview') {
      if (sidebarLoginPrompt) {
        sidebarLoginPrompt.classList.remove('visuallyhidden')
      }
    }
  }

  ebDisplayLoginPrompts()

  function ebHideSectionContents () {
    if (process.env.config.view === 'instructors-preview') {
    // If we're in a unit and haven't already done this, get all the sections
      const wrapper = document.querySelector('div.wrapper')
      if (
        wrapper.classList.contains('default-page') &&
            !wrapper.classList.contains('home') &&
            !wrapper.classList.contains('instructor-content-hidden')
      ) {
      // Flag that we have done this process to avoid repetition
        wrapper.classList.add('instructor-content-hidden')

        // Get all the sections
        const sections = document.querySelectorAll('section[id^="section"], .prompt-instructor-login')

        sections.forEach(function (section) {
        // Check whether the h2 has class "instructors-only" -- these are
        // the sections that get greyed out in instructors-preview view
          const identifier = section.id.replace('section-', '')
          const h2 = wrapper.querySelector(`h2[id='${identifier}']`)
          const isInstructorOnlyAccH2 = h2 && h2.classList.contains('instructors-only')

          if (isInstructorOnlyAccH2 || section.classList.contains('prompt-instructor-login')) {
          // Wrap the section contents for CSS covering
            const sectionWrapper = document.createElement('div')
            sectionWrapper.classList.add('obscured-section')

            if (isInstructorOnlyAccH2) {
              Array.from(section.children).forEach(function (node) {
                sectionWrapper.appendChild(node)
              })
            } else {
              sectionWrapper.innerHTML = section.innerHTML
              section.innerHTML = ''
            }

            section.appendChild(sectionWrapper)

            // Then put a login button after this obcured content
            const button = document.createElement('a')
            button.innerHTML = 'Instructor login'
            button.classList.add('instructor-login')

            button.setAttribute('href', window.location.origin + '/login' + window.location.pathname.replace('instructors-preview', 'instructors'))
            button.setAttribute('target', '_self')

            if (section.getAttribute('aria-expanded') === 'false') {
              button.classList.add('visuallyhidden')
            }

            section.insertAdjacentElement('beforeend', button)

            // When the section is open, show the button
            const sectionObserver = new MutationObserver(function (mutationsList) {
              mutationsList.forEach(function (mutation) {
                if (
                  mutation.type === 'attributes' &&
                                mutation.attributeName === 'aria-expanded'
                ) {
                  if (section.getAttribute('aria-expanded') === 'true') {
                    button.classList.remove('visuallyhidden')
                  } else {
                    button.classList.add('visuallyhidden')
                  }
                }
              })
            })

            sectionObserver.observe(section, { attributes: true })
          }
        })
      }
    }
  }

  function ebWaitForAccordion () {
    // Need to wait for the accordion to load, before we manipulating the sections

    const accordionWaiter = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes') {
          const promptSections = document.querySelector('.prompt-instructor-login')
          if (document.body.getAttribute('data-accordion-active') === 'true' || promptSections) {
            ebHideSectionContents()
          }
        }
      })
    })

    accordionWaiter.observe(document.body, { attributes: true })
  }

  ebWaitForAccordion()
}
