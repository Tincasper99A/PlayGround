import { clamp } from './utils.js'

export class Input {
  constructor(canvas, elements) {
    this.canvas = canvas
    this.elements = elements
    this.keys = new Set()
    this.justPressed = new Set()
    this.move = { x: 0, y: 0 }
    this.cameraYaw = 0.35
    this.cameraPitch = 0.18
    this.cameraDistance = 6.2
    this.fireHeld = false
    this.aiming = false
    this.joystick = { active: false, pointerId: null, x: 0, y: 0 }
    this.drag = { active: false, pointerId: null, x: 0, y: 0, lastX: 0, lastY: 0, moved: false, button: 0, type: 'mouse' }
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760
    document.body.classList.toggle('mobile-ui', this.isTouch)
    this.bind()
  }

  bind() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Tab') event.preventDefault()
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
      if (!event.repeat) this.justPressed.add(event.code)
      this.keys.add(event.code)
      if (event.code === 'KeyR') this.justPressed.add('reload')
      if (event.code === 'KeyF' || event.code === 'KeyE') this.justPressed.add('action')
      if (event.code === 'Space') this.justPressed.add('jump')
      if (event.code === 'Escape' || event.code === 'KeyP') this.justPressed.add('pause')
      if (event.code === 'KeyH') this.justPressed.add('horn')
    })
    window.addEventListener('keyup', (event) => this.keys.delete(event.code))
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.fireHeld = false
      this.resetJoystick()
      this.drag.active = false
    })
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault())
    this.canvas.addEventListener('pointerdown', (event) => this.onCanvasDown(event))
    this.canvas.addEventListener('pointermove', (event) => this.onCanvasMove(event))
    this.canvas.addEventListener('pointerup', (event) => this.onCanvasUp(event))
    this.canvas.addEventListener('pointercancel', (event) => this.onCanvasUp(event))
    this.canvas.addEventListener('wheel', (event) => {
      this.cameraDistance = clamp(this.cameraDistance + event.deltaY * 0.004, 3.2, 11)
    }, { passive: true })

    const stick = this.elements.joystick
    const base = this.elements.stickBase
    if (stick && base) {
      base.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.joystick.active = true
        this.joystick.pointerId = event.pointerId
        base.setPointerCapture(event.pointerId)
        this.updateJoystick(event)
      })
      base.addEventListener('pointermove', (event) => {
        if (!this.joystick.active || event.pointerId !== this.joystick.pointerId) return
        event.preventDefault()
        this.updateJoystick(event)
      })
      const release = (event) => {
        if (event.pointerId !== this.joystick.pointerId) return
        this.resetJoystick()
      }
      base.addEventListener('pointerup', release)
      base.addEventListener('pointercancel', release)
    }

    const fire = this.elements.fireButton
    if (fire) {
      fire.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.fireHeld = true
        this.justPressed.add('shoot')
        fire.classList.add('pressed')
        fire.setPointerCapture(event.pointerId)
      })
      const release = (event) => {
        event.preventDefault()
        this.fireHeld = false
        fire.classList.remove('pressed')
      }
      fire.addEventListener('pointerup', release)
      fire.addEventListener('pointercancel', release)
      fire.addEventListener('pointerleave', (event) => {
        if (event.buttons === 0) return
        this.fireHeld = false
        fire.classList.remove('pressed')
      })
    }
    const action = this.elements.actionButton
    if (action) {
      action.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.justPressed.add('action')
        action.classList.add('pressed')
        action.setPointerCapture(event.pointerId)
      })
      action.addEventListener('pointerup', () => action.classList.remove('pressed'))
      action.addEventListener('pointercancel', () => action.classList.remove('pressed'))
    }
    const jump = this.elements.jumpButton
    if (jump) {
      jump.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.justPressed.add('jump')
        jump.classList.add('pressed')
        jump.setPointerCapture(event.pointerId)
      })
      jump.addEventListener('pointerup', () => jump.classList.remove('pressed'))
      jump.addEventListener('pointercancel', () => jump.classList.remove('pressed'))
    }
    const reload = this.elements.reloadButton
    if (reload) {
      reload.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.justPressed.add('reload')
      })
    }
    const pause = this.elements.pauseButton
    if (pause) {
      pause.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.justPressed.add('pause')
      })
    }
    const sprint = this.elements.sprintButton
    if (sprint) {
      sprint.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        this.sprintHeld = true
      })
      const release = () => { this.sprintHeld = false }
      sprint.addEventListener('pointerup', release)
      sprint.addEventListener('pointercancel', release)
    }
  }

  updateJoystick(event) {
    const rect = this.elements.stickBase.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const max = rect.width * 0.36
    let dx = event.clientX - centerX
    let dy = event.clientY - centerY
    const length = Math.hypot(dx, dy)
    if (length > max) {
      dx = (dx / length) * max
      dy = (dy / length) * max
    }
    this.elements.stickThumb.style.transform = `translate(${dx}px, ${dy}px)`
    this.joystick.x = dx / max
    this.joystick.y = -dy / max
  }

  resetJoystick() {
    this.joystick.active = false
    this.joystick.pointerId = null
    this.joystick.x = 0
    this.joystick.y = 0
    if (this.elements.stickThumb) this.elements.stickThumb.style.transform = 'translate(0px, 0px)'
  }

  onCanvasDown(event) {
    if (this.drag.active) return
    this.drag.active = true
    this.drag.pointerId = event.pointerId
    this.drag.x = event.clientX
    this.drag.y = event.clientY
    this.drag.lastX = event.clientX
    this.drag.lastY = event.clientY
    this.drag.moved = false
    this.drag.button = event.button
    this.drag.type = event.pointerType
    this.canvas.setPointerCapture?.(event.pointerId)
  }

  onCanvasMove(event) {
    if (!this.drag.active || event.pointerId !== this.drag.pointerId) return
    const dx = event.clientX - this.drag.lastX
    const dy = event.clientY - this.drag.lastY
    if (Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 5) this.drag.moved = true
    if (this.drag.moved) {
      this.cameraYaw -= dx * 0.0044
      this.cameraPitch = clamp(this.cameraPitch + dy * 0.0032, -0.32, 0.72)
    }
    this.drag.lastX = event.clientX
    this.drag.lastY = event.clientY
  }

  onCanvasUp(event) {
    if (!this.drag.active || event.pointerId !== this.drag.pointerId) return
    if (event.type === 'pointerup' && !this.drag.moved && this.drag.type === 'mouse' && this.drag.button === 0) {
      this.justPressed.add('shoot')
    }
    this.drag.active = false
    this.drag.pointerId = null
  }

  frame() {
    const keyboardX = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0)
    const keyboardY = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0)
    this.move.x = this.joystick.active ? this.joystick.x : keyboardX
    this.move.y = this.joystick.active ? this.joystick.y : keyboardY
    const stickMagnitude = Math.hypot(this.joystick.x, this.joystick.y)
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintHeld || stickMagnitude > 0.92
  }

  consume(action) {
    if (!this.justPressed.has(action)) return false
    this.justPressed.delete(action)
    return true
  }

  clearPressed() {
    this.justPressed.clear()
    this.fireHeld = false
  }

  endFrame() {
    this.justPressed.clear()
  }

  releaseAll() {
    this.keys.clear()
    this.justPressed.clear()
    this.fireHeld = false
    this.sprintHeld = false
    this.resetJoystick()
    this.drag.active = false
  }
}
