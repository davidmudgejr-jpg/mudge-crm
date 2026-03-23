import { useMemo } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// useRoomTextures — Loads Polyhaven PBR textures for all room surfaces
// Each set: _diff (color), _ao (AO), _arm (packed AO/Rough/Metal), _nor_gl (normal)
// ---------------------------------------------------------------------------

const loader = new THREE.TextureLoader();

function loadTex(path, repeatX, repeatY, srgb) {
  const tex = loader.load(path);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  return tex;
}

function loadSet(folder, prefix, rx, ry, hasNormalJpg = false) {
  const base = `/textures/${folder}/textures`;
  const set = {
    map: loadTex(`${base}/${prefix}_diff_2k.jpg`, rx, ry, true),
    aoMap: loadTex(`${base}/${prefix}_ao_2k.jpg`, rx, ry, false),
    armMap: loadTex(`${base}/${prefix}_arm_2k.jpg`, rx, ry, false),
  };
  if (hasNormalJpg) {
    set.normalMap = loadTex(`${base}/${prefix}_nor_gl_2k.jpg`, rx, ry, false);
  }
  return set;
}

export default function useRoomTextures() {
  return useMemo(() => ({
    // Floor: painted_concrete_02 — dark, repeat 6x6
    floor: loadSet('painted_concrete_02_2k', 'painted_concrete_02', 6, 6, true),
    // Ceiling: grey_tiles — repeat 3x3
    ceiling: loadSet('grey_tiles_2k', 'grey_tiles', 3, 3, false),
    // Platform: granite_tile_04 — light grey stone, repeat 1x1
    platform: loadSet('granite_tile_04_2k', 'granite_tile_04', 1, 1, false),
    // Back wall: painted_plaster_wall — repeat 2x2
    backWall: loadSet('painted_plaster_wall_2k', 'painted_plaster_wall', 2, 2, true),
    // Left wall: plastered_wall_03 — repeat 2x2
    leftWall: loadSet('plastered_wall_03_2k', 'plastered_wall_03', 2, 2, true),
    // Right wall: plastered_wall_04 — repeat 2x2
    rightWall: loadSet('plastered_wall_04_2k', 'plastered_wall_04', 2, 2, true),
    // Platform edge trim: metal_plate_02
    metal: loadSet('metal_plate_02_2k', 'metal_plate_02', 2, 1, true),
    // Accent panels: corrugated_iron_03
    corrugated: loadSet('corrugated_iron_03_2k', 'corrugated_iron_03', 3, 2, true),
  }), []);
}
