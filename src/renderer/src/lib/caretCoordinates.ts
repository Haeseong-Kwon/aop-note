// Compute the pixel position of the caret inside a <textarea>, using a hidden
// mirror <div> that replicates the textarea's text and styling. Adapted from the
// well-known "textarea-caret-position" technique.

const MIRRORED_PROPS = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize'
] as const

export interface CaretCoords {
  /** Offset of the caret top from the textarea's top-left content origin. */
  top: number
  left: number
  /** Line height in px, so callers can offset below the current line. */
  height: number
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoords {
  const div = document.createElement('div')
  const style = div.style
  const computed = window.getComputedStyle(textarea)

  style.position = 'absolute'
  style.visibility = 'hidden'
  style.whiteSpace = 'pre-wrap'
  style.wordWrap = 'break-word'

  MIRRORED_PROPS.forEach((prop) => {
    style[prop as never] = computed[prop as never]
  })

  div.textContent = textarea.value.substring(0, position)

  const span = document.createElement('span')
  // Use a real character so the span has dimensions even at the very end.
  span.textContent = textarea.value.substring(position) || '.'
  div.appendChild(span)

  document.body.appendChild(div)
  const coords: CaretCoords = {
    top: span.offsetTop + parseInt(computed.borderTopWidth, 10) - textarea.scrollTop,
    left: span.offsetLeft + parseInt(computed.borderLeftWidth, 10) - textarea.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10)
  }
  document.body.removeChild(div)

  return coords
}
