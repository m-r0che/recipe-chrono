/**
 * One earthy palette shared by every recipe, so the hue of a band means the
 * same thing on every print. `ink` is for cream paper, `night` for the dark
 * cook-mode paper. Fleck roles paint as scattered dashes instead of bands.
 * @typedef {"liquid"|"starch"|"dairy"|"protein"|"aromatic"|"acid"|"fat"|"spice"|"mineral"|"heat"} Role
 */
export const ROLES = {
  liquid: { ink: "#5b6e7c", night: "#8fa3b1", label: "Water & liquid" },
  starch: { ink: "#c4912e", night: "#d6a848", label: "Starch" },
  dairy: { ink: "#c25a2d", night: "#d8774a", label: "Dairy & emulsion" },
  protein: { ink: "#6e2c1c", night: "#a85a44", label: "Meat & high heat" },
  heat: { ink: "#6e2c1c", night: "#a85a44", label: "Meat & high heat" },
  aromatic: { ink: "#66713a", night: "#8f9a5e", label: "Vegetables" },
  acid: { ink: "#b8331d", night: "#d05a42", label: "Tomato & acid" },
  fat: { ink: "#d9b45a", night: "#e2c47a", label: "Fat" },
  spice: { ink: "#1f1a15", night: "#a89a88", label: "Spice", fleck: true },
  mineral: { ink: "#8a8272", night: "#a89a88", label: "Salt", fleck: true },
};

export function roleInks(mode) {
  return Object.fromEntries(Object.entries(ROLES).map(([role, { ink, night }]) => [role, mode === "cook" ? night : ink]));
}
