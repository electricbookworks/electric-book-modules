const userDetailUrl = '/api/session/'
const params = {
  headers: {
    'content-type': 'application/json; charset=UTF-8'
  }
}

async function ebGetWPUserSession () {
  try {
    const userResponse = await fetch(userDetailUrl, params)
    return userResponse.status === 200 ? await userResponse.json() : null
  } catch (error) {
    console.error('Error fetching user details:', error)
  }
}

export default async function ebWordPressUserProfile () {
  const userSession = await ebGetWPUserSession()

  const profile = document.querySelector('.menu-user-profile')
  const masthead = profile.closest('.masthead')

  if (userSession) {
    const avatar = profile.querySelector('.avatar')

    avatar.classList.remove('visuallyhidden')
    profile.querySelector('.buttons').classList.add('visuallyhidden')
    profile.classList.remove('visuallyhidden')

    // When we're logged in, let the masthead know for CSS reasons
    masthead.classList.add('logged-in')
  } else {
    // Then show the login and register buttons
    profile.classList.remove('visuallyhidden')
    profile.querySelector('.buttons').classList.remove('visuallyhidden')
  }
}

export {
  ebGetWPUserSession
}
