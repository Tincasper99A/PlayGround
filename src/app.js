document.documentElement.classList.add('js')

const year = document.getElementById('year')
if (year) year.textContent = new Date().getFullYear()

let revealStarted = false

function startReveal() {
  if (revealStarted) return
  revealStarted = true

  const items = document.querySelectorAll('[data-reveal]')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!('IntersectionObserver' in window) || reducedMotion) {
    for (const item of items) item.classList.add('is-visible')
    return
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' })

  for (const item of items) observer.observe(item)
}

const gate = document.querySelector('[data-age-gate]')

if (gate) {
  const storageKey = 'nocturne.age.ok'
  const form = gate.querySelector('[data-age-form]')
  const dob = document.getElementById('dob')
  const confirmAge = document.getElementById('confirm-age')
  const enter = document.getElementById('enter-site')
  const error = document.getElementById('gate-error')
  const site = document.getElementById('site')

  const now = new Date()
  const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate())
  const pad = (value) => String(value).padStart(2, '0')
  dob.max = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`

  function parseDob(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
    return date
  }

  function ageOn(date) {
    const today = new Date()
    let age = today.getFullYear() - date.getFullYear()
    const month = today.getMonth() - date.getMonth()
    if (month < 0 || (month === 0 && today.getDate() < date.getDate())) age -= 1
    return age
  }

  function updateState() {
    const date = parseDob(dob.value)
    const age = date ? ageOn(date) : null

    if (dob.value && !date) {
      error.textContent = 'Enter a valid date of birth.'
    } else if (age !== null && age < 18) {
      error.textContent = 'Nocturne is only for adults aged 18 or older.'
    } else {
      error.textContent = ''
    }

    enter.disabled = !(age !== null && age >= 18 && confirmAge.checked)
  }

  function unlock(remember) {
    document.body.classList.remove('gated')
    gate.hidden = true
    gate.setAttribute('aria-hidden', 'true')
    if (site) site.removeAttribute('aria-hidden')
    if (remember) {
      try {
        sessionStorage.setItem(storageKey, '1')
      } catch {}
    }
    startReveal()
  }

  let remembered = false
  try {
    remembered = sessionStorage.getItem(storageKey) === '1'
  } catch {}

  if (remembered) {
    unlock(false)
  } else {
    if (site) site.setAttribute('aria-hidden', 'true')
    requestAnimationFrame(() => dob.focus())
  }

  dob.addEventListener('input', updateState)
  dob.addEventListener('change', updateState)
  confirmAge.addEventListener('change', updateState)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const date = parseDob(dob.value)
    if (!date) {
      error.textContent = 'Enter a valid date of birth.'
      dob.focus()
      return
    }
    if (ageOn(date) < 18) {
      error.textContent = 'Nocturne is only for adults aged 18 or older.'
      dob.focus()
      return
    }
    if (!confirmAge.checked) {
      error.textContent = 'Please confirm that you are of legal age.'
      confirmAge.focus()
      return
    }
    unlock(true)
  })

  gate.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return
    const focusable = Array.from(gate.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])'))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })

  updateState()
} else {
  startReveal()
}
