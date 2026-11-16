// Shared stack of open dismissable layers (Dialog and Popover content) on web.
// Only the last-pushed layer reacts to Escape or an outside press, so one
// Escape closes one layer.
const layers: string[] = [];

function pushLayer(id: string): void {
  layers.push(id);
}

function removeLayer(id: string): void {
  const index = layers.indexOf(id);
  if (index !== -1) layers.splice(index, 1);
}

function isTopLayer(id: string): boolean {
  return layers[layers.length - 1] === id;
}

export { isTopLayer, pushLayer, removeLayer };
