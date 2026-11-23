import { clampZoom, MAX_ZOOM, MIN_ZOOM, pageBox, pinchScale, touchDistance } from "./pdf-zoom";

const A4 = 1.414;

describe("clampZoom", () => {
  test("holds between fit-width and three times it", () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });

  test("a number that is not one falls back to fit-width", () => {
    // A pinch divides distances, so NaN and Infinity are one dropped touch
    // away rather than hypothetical.
    expect(clampZoom(NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(Infinity)).toBe(MAX_ZOOM);
    expect(clampZoom(-Infinity)).toBe(MIN_ZOOM);
  });
});

describe("pinchScale", () => {
  test("is how far apart the fingers are now over where they began", () => {
    expect(pinchScale(100, 200)).toBe(2);
    expect(pinchScale(200, 100)).toBe(0.5);
    expect(pinchScale(100, 100)).toBe(1);
  });

  test("two fingers on the same point do not divide by zero", () => {
    expect(pinchScale(0, 120)).toBe(1);
    expect(pinchScale(120, 0)).toBe(1);
  });
});

describe("touchDistance", () => {
  test("measures between the first two touches", () => {
    expect(
      touchDistance([
        { pageX: 0, pageY: 0 },
        { pageX: 3, pageY: 4 },
      ]),
    ).toBe(5);
  });

  test("is null with fewer than two down, which is what tells a pinch from a drag", () => {
    expect(touchDistance([])).toBeNull();
    expect(touchDistance([{ pageX: 10, pageY: 10 }])).toBeNull();
  });
});

describe("pageBox", () => {
  test("at fit-width the page and both margins are exactly the column", () => {
    const box = pageBox(300, A4, 1);

    expect(box.baseMarginWidth).toBe(40); // round(300 * 0.18 / 1.36)
    expect(box.baseWidth).toBe(220);
    expect(box.rowWidth).toBe(300);
    expect(box.scale).toBe(1);
  });

  test("the base size never moves with zoom -- only the box around it", () => {
    const fit = pageBox(300, A4, 1);
    const zoomed = pageBox(300, A4, 2);

    // This is the whole point: the <Pdf> is rendered at the base size and
    // never re-rendered, because resizing it is what crashes the native
    // renderer. Zoom grows the layout and scales the image into it.
    expect(zoomed.baseWidth).toBe(fit.baseWidth);
    expect(zoomed.baseHeight).toBe(fit.baseHeight);
    expect(zoomed.baseMarginWidth).toBe(fit.baseMarginWidth);

    expect(zoomed.width).toBe(fit.width * 2);
    expect(zoomed.height).toBe(fit.height * 2);
    expect(zoomed.marginWidth).toBe(fit.marginWidth * 2);
    expect(zoomed.scale).toBe(2);
  });

  test("the row grows with the page, so there is something to scroll sideways", () => {
    const box = pageBox(300, A4, 2.5);

    expect(box.rowWidth).toBe(750);
    expect(box.width + 2 * box.marginWidth).toBeCloseTo(box.rowWidth, 6);
  });

  test("page and margins account for the row at every column width", () => {
    for (const across of [300, 301, 359, 412, 768, 1024]) {
      for (const zoom of [1, 1.37, 2, 3]) {
        const box = pageBox(across, A4, zoom);
        expect(box.width + 2 * box.marginWidth).toBeCloseTo(box.rowWidth, 6);
        // And at fit-width it is whole points, so nothing lands on a half.
        if (zoom === 1) {
          expect(Number.isInteger(box.baseWidth)).toBe(true);
          expect(Number.isInteger(box.baseMarginWidth)).toBe(true);
          expect(box.rowWidth).toBe(across);
        }
      }
    }
  });

  test("a zoom out of range is clamped rather than trusted", () => {
    expect(pageBox(300, A4, 99).scale).toBe(MAX_ZOOM);
    expect(pageBox(300, A4, 0).scale).toBe(MIN_ZOOM);
    expect(pageBox(300, A4, NaN).scale).toBe(MIN_ZOOM);
  });

  test("a column with no width yet asks for nothing", () => {
    const box = pageBox(0, A4, 2);

    expect(box.baseWidth).toBe(0);
    expect(box.width).toBe(0);
    expect(box.rowWidth).toBe(0);
  });

  test("the aspect ratio decides the height, at any zoom", () => {
    expect(pageBox(300, 2, 1).baseHeight).toBe(440);
    expect(pageBox(300, 0.5, 1).baseHeight).toBe(110);
    expect(pageBox(300, 2, 3).height).toBe(1320);
  });
});
