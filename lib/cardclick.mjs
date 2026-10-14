// What a click on the map does where no building is drawn (src/building.js).
//   'add'   Shift-click / "+": the parcel there joins the card's selection (zoom 15+)
//   'open'  street zoom: open the parcel under the click, whether or not a card is already open (the next lot takes one click)
//   'none'  not a parcel click (zoomed out), or a click inside the property the card already shows: the map closes the card
// `shapes` are the outlines of what the open card shows (its building, its parcel, the parcels a building sits on). The parcel
// itself is looked up from the click point, never from a tile feature id (a tile feature can hold many separate neighbours).
import { inGeom } from './footprint.mjs';

export function groundClick({ adding = false, zoom = 0, cardOpen = false, point, shapes = [] } = {}) {
  if (adding) return zoom >= 15 ? 'add' : 'none';
  if (zoom < 16) return 'none';
  if (cardOpen && point && shapes.some(g => g && inGeom(point, g))) return 'none';
  return 'open';
}
