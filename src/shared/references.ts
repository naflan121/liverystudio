// "Reference images" block sent to Dola above the prompt (Livery Studio).
// Dola searches for the images itself and uses them only as generation references.
// Renderer-safe — no Node/Electron imports.

export const REFERENCE_IMAGE1_DEFAULT = 'a clear side/three-quarter photo of the real full-size {aircraft} in its current livery'

/** Fill the Image 1 template with the aircraft the prompt names (e.g. "Delta Air Lines Boeing 757-200"). */
export function fillImage1(template: string, aircraft: string): string {
  return (template.trim() || REFERENCE_IMAGE1_DEFAULT).replace(/\{aircraft\}/g, aircraft.trim())
}

/** The block itself; '' when there is no image to ask for. */
export function buildReferenceBlock(images: string[]): string {
  const list = images.map((s) => s.trim().replace(/[.\s]+$/, '')).filter(Boolean)
  if (!list.length) return ''
  const numbered = list.map((s, i) => `Image ${i + 1} = ${s}.`).join(' ')
  return `Reference images: first search for and find accurate reference images yourself, and use them as the reference images for the generation. ${numbered} Use them only as generation references — I do NOT need the images delivered back.`
}
