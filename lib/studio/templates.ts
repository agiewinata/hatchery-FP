/**
 * The parametric template catalog, and the printability policy.
 *
 * Split from geometry.ts on purpose: that module is maths and knows nothing
 * about product decisions, while this one is entirely product decisions and
 * knows nothing about triangles. Adding a template or changing a printing limit
 * should never require touching the mesh code.
 *
 * A template is plain data - an id, a label, and the parameters it exposes.
 * `buildGeometry` reads only the parameters its template declares, so adding a
 * template cannot change the behaviour of an existing one.
 */
import {
  holeCenter,
  holeFits,
  transformOutline,
  type GeometryParams,
  type HolePosition,
} from "./geometry";
import type { Outline } from "./types";

export const TEMPLATE_IDS = ["flat-charm", "keychain-tag"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const HOLE_POSITIONS = [
  "top-center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const satisfies readonly HolePosition[];

interface BaseParams {
  widthMm: number;
  thicknessMm: number;
}

export interface FlatCharmParams extends BaseParams {
  templateId: "flat-charm";
}

export interface KeychainTagParams extends BaseParams {
  templateId: "keychain-tag";
  holeDiameterMm: number;
  holeInsetMm: number;
  holePosition: HolePosition;
}

/**
 * Discriminated on `templateId`, deliberately mirroring how `fulfilmentType`
 * discriminates one Product table into two variants with their own required
 * fields. Keychain-tag parameters sent against flat-charm are rejected by the
 * schema rather than silently ignored.
 */
export type StudioParams = FlatCharmParams | KeychainTagParams;

export interface TemplateDescriptor {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly TemplateDescriptor[] = [
  {
    id: "flat-charm",
    label: "Flat charm",
    description: "Your artwork's outline, extruded. Nothing added.",
  },
  {
    id: "keychain-tag",
    label: "Keychain tag",
    description: "The same, with a keyring hole punched through it.",
  },
];

/**
 * Printing limits, sized for FDM at a 0.4 mm nozzle.
 *
 * These are advice, not security boundaries - the Zod schema enforces its own
 * absolute bounds so a hand-crafted request cannot store nonsense. These exist
 * so a user is told their charm will snap before they waste an hour of filament.
 */
export const PRINT_LIMITS = {
  minThicknessMm: 1.2, // three 0.4mm walls
  maxThicknessMm: 20,
  minWidthMm: 10,
  maxWidthMm: 200, // a typical bed
  minHoleDiameterMm: 3, // a split ring needs to pass through
  holeEdgeClearanceMm: 1.5,
} as const;

export const DEFAULT_PARAMS: Record<TemplateId, StudioParams> = {
  "flat-charm": { templateId: "flat-charm", widthMm: 50, thicknessMm: 3 },
  "keychain-tag": {
    templateId: "keychain-tag",
    widthMm: 50,
    thicknessMm: 3,
    holeDiameterMm: 4,
    holeInsetMm: 5,
    holePosition: "top-center",
  },
};

/** Translate template parameters into the geometry layer's vocabulary. */
export function toGeometryParams(params: StudioParams): GeometryParams {
  if (params.templateId === "keychain-tag") {
    return {
      widthMm: params.widthMm,
      thicknessMm: params.thicknessMm,
      hole: {
        diameterMm: params.holeDiameterMm,
        insetMm: params.holeInsetMm,
        position: params.holePosition,
      },
    };
  }

  return { widthMm: params.widthMm, thicknessMm: params.thicknessMm };
}

export interface PrintabilityIssue {
  /** Which form field to attach this to. */
  field: string;
  message: string;
}

/**
 * Everything wrong with this design, as messages a maker can act on.
 *
 * Returns issues rather than throwing: the preview must keep rendering while
 * someone drags a slider through an invalid value, and an exception would
 * replace the model with an error boundary mid-drag.
 */
export function checkPrintability(outline: Outline, params: StudioParams): PrintabilityIssue[] {
  const issues: PrintabilityIssue[] = [];

  if (params.thicknessMm < PRINT_LIMITS.minThicknessMm) {
    issues.push({
      field: "thicknessMm",
      message: `Thinner than ${PRINT_LIMITS.minThicknessMm}mm will be fragile and may not print at all.`,
    });
  }
  if (params.thicknessMm > PRINT_LIMITS.maxThicknessMm) {
    issues.push({
      field: "thicknessMm",
      message: `${PRINT_LIMITS.maxThicknessMm}mm is as thick as this makes sense.`,
    });
  }
  if (params.widthMm < PRINT_LIMITS.minWidthMm) {
    issues.push({
      field: "widthMm",
      message: `Below ${PRINT_LIMITS.minWidthMm}mm the detail in your artwork will be lost.`,
    });
  }
  if (params.widthMm > PRINT_LIMITS.maxWidthMm) {
    issues.push({
      field: "widthMm",
      message: `Wider than ${PRINT_LIMITS.maxWidthMm}mm will not fit on most print beds.`,
    });
  }

  if (params.templateId === "keychain-tag") {
    if (params.holeDiameterMm < PRINT_LIMITS.minHoleDiameterMm) {
      issues.push({
        field: "holeDiameterMm",
        message: `A keyring needs at least ${PRINT_LIMITS.minHoleDiameterMm}mm to pass through.`,
      });
    }

    // Geometry drops a hole it cannot place, so without this the hole would
    // simply vanish from the preview with no explanation.
    const shape = transformOutline(outline, params.widthMm);
    const center = holeCenter(shape, params.holeInsetMm, params.holePosition);

    if (!holeFits(shape, center, params.holeDiameterMm / 2, PRINT_LIMITS.holeEdgeClearanceMm)) {
      issues.push({
        field: "holeInsetMm",
        message: holeFits(shape, center, params.holeDiameterMm / 2)
          ? `The hole needs ${PRINT_LIMITS.holeEdgeClearanceMm}mm of material around it or it will tear out.`
          : "The hole falls outside your shape. Move it inward or pick another corner.",
      });
    }
  }

  return issues;
}
