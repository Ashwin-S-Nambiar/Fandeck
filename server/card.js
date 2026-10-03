import { readFile } from 'node:fs/promises';
import { createElement as h } from 'react';
import { inkFor } from '../js/color.js';

let assets;
export function cardAssets() {
  assets ??= Promise.all([
    readFile(new URL('./fonts/hanken-regular.ttf', import.meta.url)),
    readFile(new URL('./fonts/hanken-bold.ttf', import.meta.url)),
    readFile(new URL('./fonts/hanken-semibold.ttf', import.meta.url)),
    readFile(new URL('./fonts/fragment-regular.ttf', import.meta.url)),
    readFile(new URL('../icon.svg', import.meta.url)),
  ]).then(([regular, bold, semibold, mono, icon]) => ({
    fonts: [
      { name: 'Hanken', data: regular, weight: 400, style: 'normal' },
      { name: 'Hanken', data: bold, weight: 700, style: 'normal' },
      { name: 'Hanken', data: semibold, weight: 650, style: 'normal' },
      { name: 'Fragment', data: mono, weight: 400, style: 'normal' },
    ],
    icon: `data:image/svg+xml;base64,${icon.toString('base64')}`,
  }));
  return assets;
}

export function paletteCard(palette, icon) {
  const column = { display: 'flex', flexDirection: 'column' };
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: 1200,
        height: 630,
        alignItems: 'center',
        background: '#f0f0ef',
        color: '#141414',
        fontFamily: 'Hanken',
      },
    },
    h(
      'div',
      { style: { ...column, marginLeft: 72, width: 485 } },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 26,
            fontWeight: 700,
          },
        },
        h('img', { src: icon, width: 39, height: 39, alt: '' }),
        'Fandeck',
      ),
      h(
        'div',
        {
          style: {
            ...column,
            fontSize: 57,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-.045em',
            marginTop: 42,
          },
        },
        h('span', {}, 'One color in.'),
        h('span', { style: { color: '#237f75' } }, 'Five that work.'),
      ),
      h(
        'div',
        {
          style: {
            ...column,
            fontSize: 21,
            lineHeight: 1.5,
            color: '#62625e',
            marginTop: 22,
          },
        },
        h('span', {}, 'Build a palette, check its contrast,'),
        h('span', {}, 'and take it anywhere.'),
      ),
    ),
    h(
      'div',
      { style: { ...column, position: 'absolute', left: 622, width: 506 } },
      h(
        'div',
        { style: { display: 'flex', gap: 7, transform: 'rotate(-4deg)' } },
        ...palette.colors.map((hex, i) =>
          h(
            'div',
            {
              key: hex + i,
              style: {
                ...column,
                width: 96,
                height: 321,
                borderRadius: 3,
                overflow: 'hidden',
                background: '#fff',
                border: '1px solid #0000000d',
                boxShadow: '0 12px 10px #00000010',
              },
            },
            h(
              'div',
              {
                style: {
                  ...column,
                  height: 235,
                  flexShrink: 0,
                  padding: '177px 10px 0',
                  background: `#${hex}`,
                  color: `#${inkFor(hex)}`,
                },
              },
              h('span', { style: { fontSize: 22, fontWeight: 650 } }, 'Aa'),
              h(
                'span',
                { style: { fontSize: 9, opacity: 0.8 } },
                'Text on color',
              ),
            ),
            h(
              'div',
              {
                style: {
                  ...column,
                  padding: '11px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                },
              },
              `Color ${String(i + 1).padStart(2, '0')}`,
              h(
                'span',
                {
                  style: {
                    fontFamily: 'Fragment',
                    fontSize: 10,
                    fontWeight: 400,
                    marginTop: 6,
                    color: '#6b6b65',
                  },
                },
                `#${hex}`,
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'Fragment',
            fontSize: 11,
            color: '#73736e',
            marginTop: 26,
          },
        },
        h('span', {}, `${palette.mode.label.toUpperCase()} · SHARED PALETTE`),
        h(
          'span',
          {
            style: {
              padding: '10px 12px',
              border: '1px solid #d3d3cf',
              borderRadius: 6,
              background: '#fafaf9',
              color: '#333',
            },
          },
          'CSS  JSON  PNG',
        ),
      ),
    ),
  );
}
