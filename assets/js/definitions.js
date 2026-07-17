function ebDefinitionsInit () {
  // Check for browser support of the features we use
  return navigator.userAgent.indexOf('Opera Mini') === -1 &&
            document.querySelector !== undefined &&
            window.addEventListener !== undefined &&
            !!Array.prototype.forEach
}

// This function is not currently being used
// (See note on duplicate IDs below.)
// function ebDefinitionsSlugify (snail) {
//   'use strict'

//   return snail.toString().toLowerCase()
//     .replace(/\s+/g, '-') // Replace spaces with -
//     .replace(/[^\w-]+/g, '') // Remove all non-word chars
//     .replace(/-+/g, '-') // Replace multiple - with single -
//     .replace(/^-+/, '') // Trim - from start of text
//     .replace(/-+$/, '') // Trim - from end of text;
// }

function ebDefinitionsMoveDefinitions () {
  // Get all the definition-terms and loop over them
  const definitionTerms = document.querySelectorAll('.definition-term')

  // Loop over them
  definitionTerms.forEach(function (definitionTerm) {
    // console.debug('Processing definition for ' + definitionTerm.innerHTML)

    // Visually hide the old dl, the parent of the definitionTerm
    definitionTerm.parentNode.classList.add('hidden-definition-list')

    // Get the definition term
    let definitionTermText = definitionTerm.innerHTML

    // Detect presence of em spans
    let definitionTermTextIsItalic
    if (definitionTermText.indexOf('<em>') !== -1) {
      // console.debug(definitionTermText + ' contains italics.')
      definitionTermTextIsItalic = true
    }

    // Create a plain-text version of definitionTermText for matching with dataTermInText
    let termTextForMatching = definitionTermText

    // Remove em spans created from asterisks in markdown
    if (definitionTermTextIsItalic) {
      termTextForMatching = termTextForMatching.replace(/(<([^>]+)>)/ig, '*')
    }

    // Straighten quotes in the HTML to match data-terms

    // Store the original termTextForMatching, so we can use it later
    const termTextForMatchingWithCurlyQuotes = termTextForMatching

    termTextForMatching = termTextForMatching
      .replace('’', "'").replace('‘', "'")
      .replace('<mark data-markjs="true">', '').replace('</mark>', '') // There might be a search result marked in the term, so remove that
      .replace('&amp;', '&')

    // To check that we even have any terms to define:
    // find a data-term attribute
    let dataTermInText = document.querySelector('[data-term="' + termTextForMatching + '"]')

    // Check that we have the term in the text
    if (!dataTermInText) {
      // If there is no dataTermInText, check if it's there
      // but matches the original termTextForMatching,
      // before curly quotes were changed to straight ones.
      // This can happen if curly quotes were used in glossary.yml.

      dataTermInText = document.querySelector('[data-term="' + termTextForMatchingWithCurlyQuotes + '"]')

      // If that matches, use the curly-quote version as termTextForMatching
      if (dataTermInText) {
        termTextForMatching = termTextForMatchingWithCurlyQuotes
      } else {
        // console.debug('Could not find termTextForMatching or termTextForMatchingWithCurlyQuotes')

        // Skip this term, since here we really haven't found a match
        return
      }
    }

    // Now we can add a popup wherever the term appears

    // Find all the places where we want a popup
    const dataTermsInText = document.querySelectorAll('[data-term="' + termTextForMatching + '"]')

    // For each one, get the description and add the popup
    dataTermsInText.forEach(function (dataTermInText) {
      // console.debug('Creating popup for ' + dataTermInText.innerText)

      // If the term contained italics, put the em tags back
      if (definitionTermTextIsItalic) {
        definitionTermText = termTextForMatching.replace(/\*(.+?)\*/ig, '<em>$1</em>')
      }

      // Get the description text
      const definitionDescriptionText = definitionTerm.nextElementSibling.innerHTML

      // Add it after the data-term
      const definitionPopup = document.createElement('span')
      definitionPopup.innerHTML = '<span class="definition-hover-term">' + definitionTermText + '</span>' + ' ' + definitionDescriptionText
      definitionPopup.classList.add('visuallyhidden')
      definitionPopup.classList.add('definition-description-hover')
      definitionPopup.setAttribute('data-bookmarkable', 'no')

      // We no longer add IDs, since this creates duplicate IDs
      // where there are multiple popups for the same term.
      // Duplicate IDs are invalid and bad for accessibility.
      // definitionPopup.id = 'dd-' + ebDefinitionsSlugify(definitionTermText);

      // Insert the new popup we've created
      dataTermInText.insertAdjacentElement('afterEnd', definitionPopup)

      // Add a Word Joiner (zero-width non-breaking space) after the definition popup,
      // to ensure that any punctuation after a definition term reflows correctly.
      dataTermInText.insertAdjacentHTML('afterEnd', '&NoBreak;')

      // Add the closing X as a link
      const closeButton = document.createElement('button')
      closeButton.classList.add('close')
      closeButton.innerHTML = '<span class="visuallyhidden">close</span>'
      definitionPopup.appendChild(closeButton)
    })
  })
}

function ebDefinitionsKeyboardAccess () {
  const descriptionSpans = document.querySelectorAll('span.definition-description-hover')
  descriptionSpans.forEach(function (span) {
    const tabbableElements = span.querySelectorAll('em.definition-cross-reference a, button.close')
    tabbableElements.forEach(function (el) {
      el.setAttribute('tabindex', '-1')
    })
  })
}

function ebDefinitionsShowDescriptions () {
  // Get the terms
  const dataTerms = document.querySelectorAll('[data-term]')

  // Loop and listen for hover on child description
  dataTerms.forEach(function (dataTerm) {
    // Get the child that we want to pop up
    const childPopup = dataTerm.nextElementSibling

    if (childPopup) {
      // Show on click
      dataTerm.addEventListener('click', function () {
        childPopup.classList.remove('visuallyhidden')
      })
      // Make definitions keyboard focusable
      dataTerm.setAttribute('tabindex', 0)

      const tabbableElements = childPopup.querySelectorAll('em.definition-cross-reference a, button.close')
      // Show definition when focused and Enter is pressed
      dataTerm.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          childPopup.classList.toggle('visuallyhidden')
          tabbableElements.forEach(function (el) {
            if (el.hasAttribute('tabindex')) {
              el.removeAttribute('tabindex')
            } else {
              el.setAttribute('tabindex', '-1')
            }
          })
        }
      })
    } else {
      console.warn('A data-term is not loading. Check the definition for: ' + dataTerm.innerText)
    }
  })
}

function ebDefinitionsHideDescriptions () {
  const descriptions = document.querySelectorAll('.definition-description-hover')

  descriptions.forEach(function (description) {
    // If we mouseleave description, hide it
    // (mouseout also fires on mouseout of children, so we use mouseleave)
    description.addEventListener('mouseleave', function () {
      setTimeout(function () {
        description.classList.add('visuallyhidden')
      }, 1000)
    })
    const tabbableElements = description.querySelectorAll('em.definition-cross-reference a, button.close')
    // Close definition when Esc is pressed
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        description.classList.add('visuallyhidden')
        tabbableElements.forEach(function (el) {
          el.setAttribute('tabindex', '-1')
        })
      }
    })
  })
}

function ebDefinitionsHideDescriptionWithButton () {
  const closeButtons = document.querySelectorAll('.definition-description-hover button.close')

  // Listen for clicks on all close buttons
  closeButtons.forEach(function (closeButton) {
    closeButton.addEventListener('click', function () {
      // ev.preventDefault();
      closeButton.parentNode.classList.add('visuallyhidden')
    })
    closeButton.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        const tabbableElements = closeButton.parentNode.querySelectorAll(
          'em.definition-cross-reference a, button.close'
        )
        tabbableElements.forEach(function (el) {
          el.setAttribute('tabindex', '-1')
        })
      }
    })
  })
}

const ebDefinitions = function () {
  // Early exit for lack of browser support
  if (!ebDefinitionsInit()) {
    return
  }

  // Move all the definitions next to their terms
  ebDefinitionsMoveDefinitions()

  // Listen for hover and things
  ebDefinitionsKeyboardAccess()
  ebDefinitionsShowDescriptions()
  ebDefinitionsHideDescriptions()
  ebDefinitionsHideDescriptionWithButton()
}

export default ebDefinitions
