/* globals YT */

import { ebTrackYoutubeVideoPlay, ebTrackVideoOptionClicks } from './analytics.js'

function ebVideoInit () {
  return navigator.userAgent.indexOf('Opera Mini') === -1 &&
            document.querySelector &&
            !!Array.prototype.forEach &&
            document.body.classList &&
            document.addEventListener &&
            document.querySelectorAll('.videowrapper')
}

const ebVideoHosts = {
  youtube: 'https://www.youtube-nocookie.com/embed/',
  vimeo: 'https://player.vimeo.com/video/',
  bilibili: 'https://player.bilibili.com/player.html?bvid='
}

function ebGetVideoHost (videoElement) {
  let videoHost
  const classes = videoElement.classList

  classes.forEach(function (currentClass) {
    if (Object.keys(ebVideoHosts).includes(currentClass)) {
      videoHost = currentClass
    }
  })

  return videoHost
}

function ebVideoSubtitles (videoElement) {
  let subtitles = videoElement.getAttribute('data-video-subtitles')
  if (subtitles === 'true') {
    subtitles = 1
    return subtitles
  }
}

function ebVideoLanguage (videoElement) {
  const language = videoElement.getAttribute('data-video-language')
  return language
}

function ebVideoGetTitle (videoElement) {
  const videoTitle = videoElement.getAttribute('data-title')
  return videoTitle
}

function ebVideoTimestamp (videoElement) {
  if (videoElement.getAttribute('data-video-timestamp')) {
    const timestamp = videoElement.getAttribute('data-video-timestamp')
    return timestamp
  }
}

function ebVideoConstructURL (host, videoLanguage, videoSubtitles, videoTimestamp, videoId) {
  // Get which video host, e.g. YouTube or Vimeo
  const hostURL = ebVideoHosts[host]

  let parametersString

  if (host === 'bilibili') {
    parametersString = '&page=1&autoplay=0'
  } else {
    // Set parameters, starting with autoplay off
    parametersString = '?autoplay=0'
  }

  // Add a language, if any
  if (videoLanguage) {
    if (host === 'youtube') {
      parametersString += '&cc_lang_pref=' + videoLanguage
    }
  }

  // Add subtitles, if any
  if (videoSubtitles) {
    if (host === 'youtube') {
      parametersString += '&cc_load_policy=' + videoSubtitles
    }
  }

  // Add a timestamp, if any
  if (videoTimestamp) {
    if (host === 'youtube') {
      parametersString += '&start=' + videoTimestamp
    }
    if (host === 'vimeo') {
      parametersString += '#t=' + videoTimestamp
    }
    if (host === 'bilibili') {
      parametersString += '&t=' + videoTimestamp
    }
  }

  const videoURL = hostURL + videoId + parametersString

  return videoURL
}

function ebVideoMakeIframe (videoElement, videoTitle, videoURL) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('frameborder', 0)
  iframe.setAttribute('allowfullscreen', '')
  iframe.setAttribute('src', videoURL)
  iframe.setAttribute('title', videoTitle)

  videoElement.removeAttribute('data-title')

  return iframe
}

// function onYouTubeIframeAPIReady () {
// This is called by the youtube iframe API
// and initiates the YT object
// }

// Track the YouTube IFrame API loading state so we request the script
// only once, however many YouTube videos are on the page.
let ebYouTubeAPIRequested = false
let ebYouTubeAPICallbacks = []

// Load the YouTube IFrame API on demand, then run the callback.
// The API defines the global `YT` object. Calling `YT.ready` (or `new
// YT.Player`) before the script has loaded throws "YT is not defined",
// which aborts the rest of main.js and, in turn, stops image lazyloading.
// So we inject the API script ourselves and wait for the API's
// `onYouTubeIframeAPIReady` callback before touching `YT`.
function ebLoadYouTubeIframeAPI (callback) {
  // If the API is already available, use it immediately.
  if (window.YT && window.YT.Player) {
    callback()
    return
  }

  // Otherwise queue the callback to run once the API has loaded.
  ebYouTubeAPICallbacks.push(callback)

  // Only inject the API script once per page.
  if (!ebYouTubeAPIRequested) {
    ebYouTubeAPIRequested = true

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'

    const firstScriptTag = document.getElementsByTagName('script')[0]
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
    } else {
      document.head.appendChild(tag)
    }

    // The API calls this global function when it has finished loading.
    window.onYouTubeIframeAPIReady = function () {
      ebYouTubeAPICallbacks.forEach(function (queuedCallback) {
        queuedCallback()
      })
      ebYouTubeAPICallbacks = []
    }
  }
}

function ebVideoUseTheYoutubeIFrameAPI (videoId, videoLanguage, videoSubtitles,
  videoTitle, videoTimestamp, currentVideo) {
  function onPlayerStateChange (event) {
    const playerStatus = event.data
    // Watch for the video to start playing
    if (playerStatus === 1) {
      // call the tracking function from analytics.js
      ebTrackYoutubeVideoPlay(currentVideo)
    }
  }

  let player
  ebLoadYouTubeIframeAPI(function () {
    player = new YT.Player(videoId, {
      videoId,
      playerVars: {
        cc_lang_pref: videoLanguage,
        cc_load_policy: videoSubtitles,
        start: videoTimestamp,
        enablejsapi: 1
      },
      events: {
        onStateChange: onPlayerStateChange.bind(currentVideo)
      }
    })

    // Add a useful title for accessibility
    const iframe = player.getIframe()
    iframe.setAttribute('title', videoTitle)
  })
}

// Only show video options on button click
function ebVideoOptionsDropdown (video) {
  const videoOptions = video.querySelector('.video-options')
  if (videoOptions) {
    const button = videoOptions.querySelector('button')
    const arrowUp = button.querySelector('.arrow-up')
    const arrowDown = button.querySelector('.arrow-down')
    const options = videoOptions.querySelector('.video-options-content')
    options.classList.add('js-video-options-content')
    button.addEventListener('click', function () {
      options.classList.toggle('js-video-options-content-visible')
      arrowUp.classList.toggle('visuallyhidden')
      arrowDown.classList.toggle('visuallyhidden')
    })
    button.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault()
        options.classList.toggle('js-video-options-content-visible')
        arrowUp.classList.toggle('visuallyhidden')
        arrowDown.classList.toggle('visuallyhidden')
      }
    })
    // Close the dropdown when you press Escape
    videoOptions.addEventListener('keydown', function (event) {
      if (options.classList.contains('js-video-options-content-visible') &&
                event.key === 'Escape') {
        options.classList.remove('js-video-options-content-visible')
        arrowUp.classList.remove('visuallyhidden')
        arrowDown.classList.add('visuallyhidden')
        button.focus()
      }
    })

    // Call the tracking function from analytics.js
    if (process.env.output === 'web') {
      ebTrackVideoOptionClicks(video)
    }
  }
}

// Add Google Structured Data script to videos
function ebVideoStructuredData (videoElement, videoTitle, videoURL, videoID, videoHost) {
  const scriptElement = document.createElement('script')
  scriptElement.setAttribute('type', 'application/ld+json')

  // For upload date, we don't have permission to use the YouTube Data API to
  // get the actual upload date of the video, so we substitue the web date from
  // default.yml, which can be accessed as the meta esdate from the HTML head
  let uploadDate = document.head.querySelector('meta[property="esdate"]')?.content ?? new Date().toISOString()
  uploadDate = uploadDate.replace(' ', 'T') + '+00:00'

  const videoDescription = videoElement.querySelector('.video-description').innerText

  const videoResourceType = videoElement.getAttribute('data-resource-type')
    ? videoElement.getAttribute('data-resource-type')
    : 'Concept Overview'

  const videoEducationLevel = videoElement.getAttribute('data-education-level')
    ? videoElement.getAttribute('data-education-level')
    : 'Beginner'

  // Construct the JSON object for a learning video
  // https://developers.google.com/search/docs/appearance/structured-data/learning-video
  const jsonObject = {}
  jsonObject['@context'] = 'https://schema.org'
  jsonObject['@type'] = ['VideoObject', 'LearningResource']
  jsonObject.name = videoTitle
  jsonObject.description = videoDescription
  jsonObject.learningResourceType = videoResourceType
  jsonObject.educationalLevel = videoEducationLevel
  jsonObject.embedUrl = videoURL
  jsonObject.uploadDate = uploadDate

  if (videoHost === 'youtube') {
    jsonObject.thumbnailUrl = [`https://img.youtube.com/vi/${videoID}/0.jpg`]
  } else if (videoHost === 'vimeo') {
    jsonObject.thumbnailUrl = [`https://i.vimeocdn.com/video/${videoID}.webp`]
  } else {
    const videoImage = videoElement.querySelector('.video-link img')?.src
    if (videoImage) {
      jsonObject.thumbnailUrl = [videoImage]
    }
  }

  scriptElement.innerText = JSON.stringify(jsonObject)

  return scriptElement
}

// ebVideoShow is called from accordions.js,
// when a section is opened, for the videos in that section.
function ebVideoShow (section) {
  // early exit for unsupported browsers
  if (!ebVideoInit()) {
    return
  }

  let videos = []
  if (section) {
    videos = section.querySelectorAll('.video')
  } else {
    videos = document.querySelectorAll('.video')
  }

  videos.forEach(function (currentVideo) {
    // first check whether it is necessary to run the video builder
    if (!currentVideo.classList.contains('video-embedded')) {
      const videoHost = ebGetVideoHost(currentVideo)
      const videoId = currentVideo.getAttribute('data-video-id')
      const videoLanguage = ebVideoLanguage(currentVideo)
      const videoSubtitles = ebVideoSubtitles(currentVideo)
      const videoTitle = ebVideoGetTitle(currentVideo)
      const videoTimestamp = ebVideoTimestamp(currentVideo)

      const videowrapper = currentVideo.querySelector('.video-wrapper')
      currentVideo.classList.add('video-embedded')

      // Remove unnecessary anchor element
      if (videowrapper.querySelector('a')) {
        videowrapper.removeChild(videowrapper.querySelector('a'))
      }

      const videoURL = ebVideoConstructURL(videoHost, videoLanguage, videoSubtitles, videoTimestamp, videoId)

      if (videoHost === 'youtube' && process.env.output === 'web') {
        // Use the youtube iframe api for youtube videos
        // There is a holder div with id=videoId that will be replaced
        // with an iframe by the API
        ebVideoUseTheYoutubeIFrameAPI(
          videoId, videoLanguage, videoSubtitles, videoTitle, videoTimestamp, currentVideo
        )
      } else {
        const iframe = ebVideoMakeIframe(currentVideo, videoTitle, videoURL)
        videowrapper.appendChild(iframe)
      }

      // Scriptify the options dropdown
      ebVideoOptionsDropdown(currentVideo)

      if (process.env.output === 'web') {
        // Add the script for Google Structured Data
        const scriptEl = ebVideoStructuredData(currentVideo, videoTitle, videoURL, videoId, videoHost)

        videowrapper.insertAdjacentElement('afterbegin', scriptEl)
      }
    }
  })
}

export default function ebVideos () {
  ebVideoShow()
}

export { ebVideoShow }
