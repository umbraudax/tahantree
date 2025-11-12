const DEFAULT_TIMEOUT = 4000
const POLL_INTERVAL = 50

const coerceToHTMLElement = (element: Element | null): HTMLElement | null => {
  if (!element) return null
  if (element instanceof HTMLElement) return element
  if (element instanceof SVGElement) return element as unknown as HTMLElement
  return element as unknown as HTMLElement
}

export const waitForElement = (
  selector: string | (() => Element | null),
  timeout: number = DEFAULT_TIMEOUT,
): Promise<HTMLElement> =>
  new Promise((resolve, reject) => {
    const resolveElement = (element: Element | null) => {
      const coerced = coerceToHTMLElement(element)
      if (coerced) {
        resolve(coerced)
        return true
      }
      return false
    }

    const immediate = typeof selector === 'string' ? document.querySelector(selector) : selector()
    if (resolveElement(immediate)) {
      return
    }

    const start = performance.now()

    const tick = () => {
      const now = performance.now()
      if (now - start >= timeout) {
        reject(new Error(`Timed out waiting for element: ${typeof selector === 'string' ? selector : 'callback'}`))
        return
      }

      const element = typeof selector === 'string' ? document.querySelector(selector) : selector()
      if (resolveElement(element)) {
        return
      }

      window.setTimeout(tick, POLL_INTERVAL)
    }

    tick()
  })

export const queryOptional = (selector: string): HTMLElement | null =>
  coerceToHTMLElement(document.querySelector(selector))

export const attachToSelector = (
  selector: string | string[] | (() => Element | null),
): { element: HTMLElement | string | null; on: undefined } => {
  if (Array.isArray(selector)) {
    for (const candidate of selector) {
      const found = coerceToHTMLElement(document.querySelector(candidate))
      if (found) {
        return { element: found, on: undefined }
      }
    }
    return { element: selector[0] ?? null, on: undefined }
  }

  if (typeof selector === 'function') {
    return { element: coerceToHTMLElement(selector()), on: undefined }
  }

  const element = coerceToHTMLElement(document.querySelector(selector))
  return { element: element ?? selector, on: undefined }
}

