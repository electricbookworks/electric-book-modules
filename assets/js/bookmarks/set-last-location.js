import ebBookmarksSetBookmark from './set-bookmark'
import ebBookmarksElementID from './element-id'

function ebBookmarksSetLastLocation () {
  // beforeunload isn't supported on iOS Safari
  // So we set the lastLocation every 5 seconds.
  window.setInterval(function () {
    const elementID = ebBookmarksElementID()
    // Only save when the ID resolves to a real element on the page.
    // Otherwise document.getElementById returns null and ebBookmarksSetBookmark
    // would throw when it reads the element's textContent.
    if (elementID) {
      const element = document.getElementById(elementID)
      if (element) {
        ebBookmarksSetBookmark('lastLocation', element)
      }
    }
  }, 5000)
}

export default ebBookmarksSetLastLocation
