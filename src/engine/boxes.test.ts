import { describe, expect, it } from 'vitest';
import { parseElements, serializeElements } from './clipboard';
import { elementBounds, type ImageElement, type NoteElement, type TextElement } from './elements';
import { History } from './history';
import { elementHitsSegment } from './hit';
import { Scene } from './scene';
import { elementsInLasso } from './selection';
import { rotateElement, scaleElement, selectionBox } from './transform';

const text: TextElement = {
  id: 't',
  type: 'text',
  z: 1,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  text: 'hola',
  fontSize: 20,
  color: 'ink',
  font: 'inter',
  align: 'left',
  wrap: false,
  width: 100,
  height: 25,
};

const image: ImageElement = {
  id: 'i',
  type: 'image',
  z: 2,
  x: 0,
  y: 100,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  assetId: 'a',
  width: 200,
  height: 100,
};

const note: NoteElement = {
  id: 'n',
  type: 'note',
  z: 3,
  x: 300,
  y: 0,
  rotation: 0,
  opacity: 1,
  groupId: null,
  locked: false,
  text: 'nota',
  fontSize: 20,
  variant: 'plain',
  color: 'yellow',
  textColor: null,
  font: 'inter',
  align: 'left',
  valign: 'top',
  width: 220,
  height: 220,
};

describe('elementos caja', () => {
  it('se aciertan en cualquier punto de su caja, también girados', () => {
    expect(elementHitsSegment(text, { x: 50, y: 12 }, { x: 50, y: 12 }, 0)).toBe(true);
    expect(elementHitsSegment(text, { x: 150, y: 12 }, { x: 150, y: 12 }, 0)).toBe(false);
    const rotated = rotateElement(image, { x: 100, y: 150 }, Math.PI / 2);
    expect(elementHitsSegment(rotated, { x: 100, y: 230 }, { x: 100, y: 230 }, 0)).toBe(true);
    expect(elementHitsSegment(rotated, { x: 190, y: 150 }, { x: 190, y: 150 }, 0)).toBe(false);
  });

  it('el borrador los toca al cruzar un borde', () => {
    expect(elementHitsSegment(note, { x: 250, y: 100 }, { x: 350, y: 100 }, 1)).toBe(true);
  });

  it('el lazo los selecciona si rodea la caja', () => {
    const scene = new Scene();
    scene.apply(new Map([[text.id, text]]));
    const around = [
      { x: -10, y: -10 },
      { x: 110, y: -10 },
      { x: 110, y: 40 },
      { x: -10, y: 40 },
    ];
    expect(elementsInLasso(scene, around).map((e) => e.id)).toEqual(['t']);
  });

  it('desde una esquina, el texto escala en proporción con su letra', () => {
    const box = selectionBox([text])!;
    const scaled = scaleElement(text, box, { x: -box.width / 2, y: -box.height / 2 }, 2, 2);
    expect(scaled.fontSize).toBeCloseTo(40);
    expect(scaled.width).toBeCloseTo(200);
    expect(scaled.height).toBeCloseTo(50);
    expect(scaled.wrap).toBe(false);
  });

  it('una imagen alineada con el marco se puede estirar en un eje', () => {
    const box = selectionBox([image])!;
    const scaled = scaleElement(image, box, { x: -box.width / 2, y: 0 }, 2, 1);
    expect(scaled.width).toBeCloseTo(400);
    expect(scaled.height).toBeCloseTo(100);
    expect(elementBounds(scaled).minX).toBeCloseTo(0);
  });

  it('copiar una imagen incluye sus datos', () => {
    const src = 'data:image/png;base64,AAAA';
    const content = parseElements(serializeElements({ elements: [image], assets: { a: src } }));
    expect(content?.elements[0].type).toBe('image');
    expect(content?.assets.a).toBe(src);
    // Sin los datos de la imagen no se puede pegar.
    expect(parseElements(serializeElements({ elements: [image], assets: {} }))).toBeNull();
  });
});

describe('historial agrupado', () => {
  it('cambios seguidos con la misma clave se deshacen de una vez', () => {
    const scene = new Scene();
    const history = new History(scene, () => {});
    history.commit(new Map([[text.id, text]]));
    history.commit(new Map([[text.id, { ...text, fontSize: 30 }]]), 'size');
    history.commit(new Map([[text.id, { ...text, fontSize: 40 }]]), 'size');
    history.commit(new Map([[text.id, { ...text, fontSize: 50 }]]), 'size');
    expect((scene.get('t') as TextElement).fontSize).toBe(50);

    history.undo();
    expect((scene.get('t') as TextElement).fontSize).toBe(20);
    history.redo();
    expect((scene.get('t') as TextElement).fontSize).toBe(50);
  });

  it('claves distintas no se funden', () => {
    const scene = new Scene();
    const history = new History(scene, () => {});
    history.commit(new Map([[text.id, text]]));
    history.commit(new Map([[text.id, { ...text, fontSize: 30 }]]), 'size');
    history.commit(new Map([[text.id, { ...text, fontSize: 30, color: 'red' }]]), 'color');
    history.undo();
    expect((scene.get('t') as TextElement).fontSize).toBe(30);
    expect((scene.get('t') as TextElement).color).toBe('ink');
  });
});
