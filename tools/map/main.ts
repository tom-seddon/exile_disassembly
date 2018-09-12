import * as argparse from 'argparse';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as colors from 'colors';
import * as pngjs from 'pngjs';
import * as assert from 'assert';
import * as CPU from './CPU';
import * as path from 'path';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// Notes
// -----

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const PNG_COLOUR_TYPE_RGBA = 6;//how come this isn't part of the library already.
const LORENZ_PATH = './testsuite-2.15/ascii-bin/';

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function p(x: string): void {
    process.stderr.write(x);
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function pn(x: string): void {
    p(x);
    p('\n');
}

function fatal(x: string): void {
    process.stderr.write('FATAL: ' + x + '\n');
    process.exit(1);
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function hex2(x: number): string {
    return x.toString(16).padStart(2, '0');
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

// 8-bit value as described in the do_the_plotting comments.
const DEFAULT_PALETTE = 0x71;

const SQUARE_WIDTH = 16;
const SQUARE_HEIGHT = 32;

const SPRITES_WIDTH = 128;
const SPRITES_HEIGHT = 81;
const NUM_SPRITES = 0x7d;

let gExile: Buffer;//exile file is loaded starting from offset 0x100
const gSpritePNGs: pngjs.PNG[] = [];

// exports from $.EXILEB
const EXILEB_EXPORTS = {
    square_sprite: 0x08,
    square_orientation: 0x09,
    background_processing_flag: 0x2d,
    this_object_x_low: 0x4f,
    this_object_y_low: 0x51,
    this_sprite_flipping_flags: 0x63,
    this_object_sprite: 0x75,
    this_object_flipping_flags: 0x71,
    this_object_palette: 0x73,
    square_x: 0x95,
    square_y: 0x97,
    determine_background: 0x1715,
    background_sprite_lookup: 0x4ab,
    sprite_data: 0x53ec,
    sprite_width_lookup: 0x5e0c,
    sprite_height_lookup: 0x5e89,
    sprite_offset_a_lookup: 0x5f06,
    sprite_offset_b_lookup: 0x5f83,
    map_data: 0x4fec,
    background_objects_x_lookup: 0x5ef,
    background_objects_range: 0x5d4,
    background_objects_data_offset: 0x5dd,
    background_objects_type_offset: 0x5e6,
    background_lookup: 0x114f,
    background_objects_handler_lookup: 0x6ee,
    lookup_for_unmatched_hash: 0x117c,
    setup_background_sprite_values: 0x2398,
    palette_value_to_pixel_lookup: 0xb79,
    calculate_background: 0x178d,
};

// (so in principle this could run off the contents of $.EXILEMC too.)
const X = EXILEB_EXPORTS;

function newExileCPU(): CPU.CPU {
    const cpu = new CPU.CPU();

    gExile.copy(cpu.mem, 0);

    assert.ok(cpu.read16(0x204) === 0x12a6);

    return cpu;
}

function callRoutine(cpu: CPU.CPU, addr: number): void {
    const thunk = 0xf000;

    cpu.mem[thunk + 0] = 0x20;
    cpu.mem[thunk + 1] = addr & 0xff;
    cpu.mem[thunk + 2] = (addr >> 8) & 0xff;

    cpu.pc = thunk;

    while (cpu.pc !== thunk + 3) {
        //pn(cpu.getDescription());
        cpu.step();
    }
}

function savePNG(png: pngjs.PNG, filePath: string): void {
    fs.writeFileSync(filePath, pngjs.PNG.sync.write(png));
}

function getPixel(png: pngjs.PNG, x: number, y: number): number[] {
    if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
        const offset = (y * png.width + x) * 4;

        return [png.data[offset + 0] / 255.0, png.data[offset + 1] / 255.0, png.data[offset + 2] / 255.0];
    } else {
        return [0, 0, 0];
    }
}

function getPixelValue(floatValue: number): number {
    if (floatValue < 0) {
        return 0;
    } else if (floatValue >= 1) {
        return 255;
    } else {
        return Math.floor(floatValue * 256);
    }
}

function blend(a: number, b: number, t: number): number {
    return (1 - t) * a + t * b;
}

function setPixel(png: pngjs.PNG, x: number, y: number, pixel: number[], alpha?: number) {
    if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
        const offset = (y * png.width + x) * 4;

        const oldPixel = getPixel(png, x, y);

        if (alpha === undefined) {
            alpha = 1;
        }

        const r = blend(oldPixel[0], pixel[0], alpha);
        const g = blend(oldPixel[1], pixel[1], alpha);
        const b = blend(oldPixel[2], pixel[2], alpha);

        png.data[offset + 0] = getPixelValue(r);
        png.data[offset + 1] = getPixelValue(g);
        png.data[offset + 2] = getPixelValue(b);
        png.data[offset + 3] = 255;
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

const TELETEXT_CHARS = [
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......',
    '......|...X..|..X.X.|...XX.|..XXX.|.XX...|..X...|...X..|....X.|..X...|...X..|......|......|......|......|......|...X..|...X..|..XXX.|.XXXXX|....X.|.XXXXX|...XX.|.XXXXX|..XXX.|..XXX.|......|......|....X.|......|..X...|..XXX.|..XXX.|...X..|.XXXX.|..XXX.|.XXXX.|.XXXXX|.XXXXX|..XXX.|.X...X|..XXX.|.....X|.X...X|.X....|.X...X|.X...X|..XXX.|.XXXX.|..XXX.|.XXXX.|..XXX.|.XXXXX|.X...X|.X...X|.X...X|.X...X|.X...X|.XXXXX|......|.X....|......|......|..X.X.|......|......|.X....|......|.....X|......|....X.|......|.X....|...X..|...X..|..X...|..XX..|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|..X...|..X.X.|.XX...|......|.XXXXX',
    '......|...X..|..X.X.|..X..X|.X.X.X|.XX..X|.X.X..|...X..|...X..|...X..|.X.X.X|...X..|......|......|......|.....X|..X.X.|..XX..|.X...X|.....X|...XX.|.X....|..X...|.....X|.X...X|.X...X|......|......|...X..|......|...X..|.X...X|.X...X|..X.X.|.X...X|.X...X|.X...X|.X....|.X....|.X...X|.X...X|...X..|.....X|.X..X.|.X....|.XX.XX|.X...X|.X...X|.X...X|.X...X|.X...X|.X...X|...X..|.X...X|.X...X|.X...X|.X...X|.X...X|.....X|...X..|.X....|...X..|...X..|..X.X.|......|......|.X....|......|.....X|......|...X..|......|.X....|......|......|..X...|...X..|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|..X...|..X.X.|...X..|...X..|.XXXXX',
    '......|...X..|..X.X.|..X...|.X.X..|....X.|.X.X..|...X..|..X...|....X.|..XXX.|...X..|......|......|......|....X.|.X...X|...X..|.....X|....X.|..X.X.|.XXXX.|.X....|....X.|.X...X|.X...X|...X..|...X..|..X...|.XXXXX|....X.|....X.|.X.XXX|.X...X|.X...X|.X....|.X...X|.X....|.X....|.X....|.X...X|...X..|.....X|.X.X..|.X....|.X.X.X|.XX..X|.X...X|.X...X|.X...X|.X...X|.X....|...X..|.X...X|.X...X|.X...X|..X.X.|..X.X.|....X.|..X...|.X....|....X.|..XXX.|.XXXXX|......|..XXX.|.XXXX.|..XXXX|..XXXX|..XXX.|...X..|..XXXX|.XXXX.|..XX..|...X..|..X..X|...X..|.XX.X.|.XXXX.|..XXX.|.XXXX.|..XXXX|..X.XX|..XXXX|..XXX.|.X...X|.X...X|.X...X|.X...X|.X...X|.XXXXX|..X...|..X.X.|.XX...|......|.XXXXX',
    '......|...X..|......|.XXX..|..XXX.|...X..|..X...|......|..X...|....X.|...X..|.XXXXX|......|..XXX.|......|...X..|.X...X|...X..|...XX.|...XX.|.X..X.|.....X|.XXXX.|...X..|..XXX.|..XXXX|......|......|.X....|......|.....X|...X..|.X.X.X|.X...X|.XXXX.|.X....|.X...X|.XXXX.|.XXXX.|.X....|.XXXXX|...X..|.....X|.XX...|.X....|.X.X.X|.X.X.X|.X...X|.XXXX.|.X...X|.XXXX.|..XXX.|...X..|.X...X|..X.X.|.X.X.X|...X..|...X..|...X..|.XXXXX|.X....|.XXXXX|.X.X.X|..X.X.|.XXXXX|.....X|.X...X|.X....|.X...X|.X...X|..XXX.|.X...X|.X...X|...X..|...X..|..X.X.|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..XX..|.X....|...X..|.X...X|.X...X|.X...X|..X.X.|.X...X|....X.|..X...|..X.X.|...X..|.XXXXX|.XXXXX',
    '......|...X..|......|..X...|...X.X|..X...|.X.X.X|......|..X...|....X.|..XXX.|...X..|...X..|......|......|..X...|.X...X|...X..|..X...|.....X|.XXXXX|.....X|.X...X|..X...|.X...X|.....X|......|...X..|..X...|.XXXXX|....X.|...X..|.X.XXX|.XXXXX|.X...X|.X....|.X...X|.X....|.X....|.X..XX|.X...X|...X..|.....X|.X.X..|.X....|.X...X|.X..XX|.X...X|.X....|.X.X.X|.X.X..|.....X|...X..|.X...X|..X.X.|.X.X.X|..X.X.|...X..|..X...|..X...|.X.XX.|....X.|...X..|.XXXXX|......|..XXXX|.X...X|.X....|.X...X|.XXXXX|...X..|.X...X|.X...X|...X..|...X..|..XX..|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..X...|..XXX.|...X..|.X...X|..X.X.|.X.X.X|...X..|.X...X|...X..|..X..X|..X.X.|.XX..X|......|.XXXXX',
    '......|......|......|..X...|.X.X.X|.X..XX|.X..X.|......|...X..|...X..|.X.X.X|...X..|...X..|......|......|.X....|..X.X.|...X..|.X....|.X...X|....X.|.X...X|.X...X|..X...|.X...X|....X.|...X..|...X..|...X..|......|...X..|......|.X....|.X...X|.X...X|.X...X|.X...X|.X....|.X....|.X...X|.X...X|...X..|.X...X|.X..X.|.X....|.X...X|.X...X|.X...X|.X....|.X..X.|.X..X.|.X...X|...X..|.X...X|...X..|.X.X.X|.X...X|...X..|.X....|...X..|.....X|...X..|...X..|..X.X.|......|.X...X|.X...X|.X....|.X...X|.X....|...X..|.X...X|.X...X|...X..|...X..|..X.X.|...X..|.X.X.X|.X...X|.X...X|.X...X|.X...X|..X...|.....X|...X..|.X...X|..X.X.|.X.X.X|..X.X.|.X...X|..X...|....XX|..X.X.|....XX|...X..|.XXXXX',
    '......|...X..|......|.XXXXX|..XXX.|....XX|..XX.X|......|....X.|..X...|...X..|......|..X...|......|...X..|......|...X..|..XXX.|.XXXXX|..XXX.|....X.|..XXX.|..XXX.|..X...|..XXX.|..XX..|......|..X...|....X.|......|..X...|...X..|..XXXX|.X...X|.XXXX.|..XXX.|.XXXX.|.XXXXX|.X....|..XXXX|.X...X|..XXX.|..XXX.|.X...X|.XXXXX|.X...X|.X...X|..XXX.|.X....|..XX.X|.X...X|..XXX.|...X..|..XXX.|...X..|..X.X.|.X...X|...X..|.XXXXX|......|....X.|......|......|..X.X.|......|..XXXX|.XXXX.|..XXXX|..XXXX|..XXX.|...X..|..XXXX|.X...X|..XXX.|...X..|..X..X|..XXX.|.X.X.X|.X...X|..XXX.|.XXXX.|..XXXX|..X...|.XXXX.|....X.|..XXXX|...X..|..X.X.|.X...X|..XXXX|.XXXXX|...X.X|..X.X.|...X.X|......|.XXXXX',
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|...X..|......|......|......|......|......|......|......|......|......|......|.....X|......|......|..X...|......|......|......|......|......|.X....|.....X|......|......|......|......|......|......|......|.....X|......|...XXX|......|...XXX|......|......',
    '......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|......|...XXX|......|......|......|......|......|......|......|......|......|......|..XXX.|......|......|......|......|......|......|......|......|.X....|.....X|......|......|......|......|......|......|......|..XXX.|......|.....X|......|.....X|......|......',
];

const MINI_OTHER_CHARS = [
    '...',
    '...',
    '...',
    '...',
    '...',
];

const MINI_DIGIT_CHARS = [
    'XXX|XX.|XXX|XXX|X.X|XXX|XXX|XXX|XXX|XXX',
    'X.X|.X.|..X|..X|X.X|X..|X..|..X|X.X|X.X',
    'X.X|.X.|XXX|XXX|XXX|XXX|XXX|..X|XXX|XXX',
    'X.X|.X.|X..|..X|..X|..X|X.X|..X|X.X|..X',
    'XXX|XXX|XXX|XXX|..X|XXX|XXX|..X|XXX|XXX',
];

const MINI_ALPHA_CHARS = [
    'XXX|XX.|XXX|XX.|XXX|XXX|XXX|X.X|XXX|XXX|X.X|X..|X.X|X.X|XXX|XXX|XXX|XX.|XXX|XXX|X.X|X.X|X.X|X.X|X.X|XXX',
    'X.X|X.X|X..|X.X|X..|X..|X..|X.X|.X.|.X.|X.X|X..|XXX|XXX|X.X|X.X|X.X|X.X|X..|.X.|X.X|X.X|X.X|X.X|X.X|..X',
    'XXX|XX.|X..|X.X|XXX|XXX|X.X|XXX|.X.|.X.|XX.|X..|XXX|XXX|X.X|XXX|X.X|XX.|XXX|.X.|X.X|X.X|XXX|.X.|XXX|.X.',
    'X.X|X.X|X..|X.X|X..|X..|X.X|X.X|.X.|.X.|X.X|X..|X.X|XXX|X.X|X..|XXX|X.X|..X|.X.|X.X|.X.|XXX|X.X|.X.|X..',
    'X.X|XX.|XXX|XX.|XXX|X..|XXX|X.X|XXX|XX.|X.X|XXX|X.X|X.X|XXX|X..|XX.|X.X|XXX|.X.|XXX|.X.|X.X|X.X|.X.|XXX',
];

function printStr(png: pngjs.PNG, startX: number, startY: number, str: string) {
    let chX = startX;

    const WHITE = [1, 1, 1];
    const BLACK = [0, 0, 0];

    for (let chIdx = 0; chIdx < str.length; ++chIdx) {
        let c = str.charCodeAt(chIdx);

        let chars: string[];
        let index: number;

        if (str[chIdx] >= 'A' && str[chIdx] <= 'Z') {
            chars = MINI_ALPHA_CHARS;
            index = (str.charCodeAt(chIdx) - 'A'.charCodeAt(0)) * 4;
        } else if (str[chIdx] >= 'a' && str[chIdx] <= 'z') {
            chars = MINI_ALPHA_CHARS;
            index = (str.charCodeAt(chIdx) - 'a'.charCodeAt(0)) * 4;
        } else if (str[chIdx] >= '0' && str[chIdx] <= '9') {
            chars = MINI_DIGIT_CHARS;
            index = (str.charCodeAt(chIdx) - '0'.charCodeAt(0)) * 4;
        } else {
            chars = MINI_OTHER_CHARS;
            index = 0;
        }

        for (let y = 0; y < 5; ++y) {
            for (let x = 0; x < (chIdx === str.length - 1 ? 3 : 4); ++x) {
                const py = startY + y;
                const px = startX + chIdx * 4 + x;

                let pixel: number[];

                if (x < 3 && chars[y][index + x] === 'X') {
                    pixel = WHITE;
                } else {
                    pixel = BLACK;
                }

                setPixel(png, px, py, pixel);//, 0.5);
            }
        }

        // for (let chIdx = 0; chIdx < str.length; ++chIdx) {
        //     let c = str.charCodeAt(chIdx);
        //     if (c < 32 || c >= 126) {
        //         c = 32;
        //     }

        //     const i = (c - 32) * 7;
        //     for (let y = 0; y < 10; ++y) {
        //         for (let x = 0; x < 6; ++x) {
        //             const py = startY + y;
        //             const px = startX + chIdx * 6 + x;

        //             let pixel: number[];

        //             if (TELETEXT_CHARS[y][i + x] === '.') {
        //                 pixel = getPixel(png, px, py);
        //                 pixel[0] *= 0.5;
        //                 pixel[1] *= 0.5;
        //                 pixel[2] *= 0.5;
        //             } else {
        //                 pixel = WHITE;
        //             }

        //             setPixel(png, px, py, pixel);
        //         }
        //     }

        //     chX += 6;
        // }
    }
}

function mustBeValidSprite(sprite: number): void {
    assert.ok(sprite >= 0 && sprite < 0x80, 'invalid sprite');
}

function getSpriteWidth(sprite: number): number {
    mustBeValidSprite(sprite);

    return 1 + (gExile[X.sprite_width_lookup + sprite] >> 4);
}

function getSpriteHeight(sprite: number): number {
    mustBeValidSprite(sprite);

    return 1 + (gExile[X.sprite_height_lookup + sprite] >> 3);
}

const BEEB_PALETTE: number[][] = [];
for (let i = 0; i < 16; ++i) {
    // Entries 8...15 aren't super-useful, but there's no harm in having them
    // and maybe there'll turn out to be a need for them...
    BEEB_PALETTE.push([(i & 1) !== 0 ? 1 : 0, (i & 2) !== 0 ? 1 : 0, (i & 4) !== 0 ? 1 : 0]);
}

function getRightMode2Pixel(value: number): number {
    const a = (value & 0x40) !== 0 ? 8 : 0;
    const b = (value & 0x10) !== 0 ? 4 : 0;
    const c = (value & 0x04) !== 0 ? 2 : 0;
    const d = (value & 0x01) !== 0 ? 1 : 0;

    return a | b | c | d;
}

function putSprite(
    destPNG: pngjs.PNG,
    destX: number,
    destY: number,
    sprite: number,
    flipX: boolean,
    flipY: boolean,
    palette: number): void {
    mustBeValidSprite(sprite);

    const width = getSpriteWidth(sprite);
    const height = getSpriteHeight(sprite);

    const a = gExile[X.sprite_offset_a_lookup + sprite];
    const b = gExile[X.sprite_offset_b_lookup + sprite];

    if ((gExile[X.sprite_width_lookup + sprite] & 1) !== 0) {
        flipX = !flipX;
    }

    if ((gExile[X.sprite_height_lookup + sprite] & 1) !== 0) {
        flipY = !flipY;
    }

    const srcY = b >> 3 | (b & 7) << 5;

    let srcX = a >> 6 | (a & 7) << 2;
    srcX <<= 2;
    srcX += a >> 4 & 3;

    assert.ok(srcX >= 0 && srcX + (width >> 1) <= SPRITES_WIDTH, 'X bork: srcX=' + srcX + ', width=' + width);
    assert.ok(srcY >= 0 && srcY + height <= SPRITES_HEIGHT, 'Y bork: srcY=' + srcY + ', height=' + height);

    for (let destDY = 0; destDY < height; ++destDY) {
        let srcDY = destDY;
        if (flipY) {
            srcDY = height - 1 - srcDY;
        }

        for (let destDX = 0; destDX < width; ++destDX) {
            let srcDX = destDX;
            if (flipX) {
                srcDX = width - 1 - srcDX;
            }

            const x = srcX + srcDX;
            const y = srcY + srcDY;

            let value = gExile[X.sprite_data + ((y * SPRITES_WIDTH + x) >> 2)] << (x & 3);

            let pixel;
            switch (value & 0x88) {
                default:
                case 0x00:
                    // background
                    pixel = BEEB_PALETTE[0];
                    break;

                case 0x08:
                    // pair right
                    pixel = BEEB_PALETTE[getRightMode2Pixel(gExile[X.palette_value_to_pixel_lookup + (palette & 0x0f)])];
                    break;

                case 0x80:
                    // pair left
                    pixel = BEEB_PALETTE[getRightMode2Pixel(gExile[X.palette_value_to_pixel_lookup + (palette & 0x0f)] >> 1)];
                    break;

                case 0x88:
                    // primary
                    pixel = BEEB_PALETTE[palette >> 4 & 0x0f];
                    break;
            }

            setPixel(destPNG, destX + destDX, destY + destDY, pixel);
        }
    }
}

function doSpritePage(): void {
    const spritesPNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width: SPRITES_WIDTH, height: SPRITES_HEIGHT });

    const palette = [
        BEEB_PALETTE[0],
        BEEB_PALETTE[1],
        BEEB_PALETTE[2],
        BEEB_PALETTE[7],
    ];

    for (let y = 0; y < SPRITES_HEIGHT; ++y) {
        for (let x = 0; x < SPRITES_WIDTH; ++x) {
            let byte = gExile[X.sprite_data + ((y * SPRITES_WIDTH + x) >> 2)];

            byte <<= x & 3;

            let pixel = 0;

            if ((byte & 0x80) !== 0) {
                pixel |= 2;
            }

            if ((byte & 0x08) !== 0) {
                pixel |= 1;
            }

            setPixel(spritesPNG, x, y, palette[pixel]);
        }
    }

    fs.writeFileSync('./output/sprite_page.png', pngjs.PNG.sync.write(spritesPNG));
}

function doSprites(): void {
    for (let sprite = 0; sprite < NUM_SPRITES; ++sprite) {
        const width = getSpriteWidth(sprite);
        const height = getSpriteHeight(sprite);

        pn('sprite ' + hex2(sprite) + ' - ' + getSpriteWidth(sprite) + ' x ' + getSpriteHeight(sprite));

        const spritePNG = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width, height });
        putSprite(spritePNG, 0, 0, sprite, false, false, DEFAULT_PALETTE);
        savePNG(spritePNG, './output/' + hex2(sprite) + '.png');
        gSpritePNGs.push(spritePNG);
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function mustBeByte(x: number): void {
    assert.ok(x >= 0 && x < 256);
}

function mustBeBytes(...xs: number[]): void {
    for (const x of xs) {
        mustBeByte(x);
    }
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface IBackground {
    squareSprite: number;
    squareOrientation: number;
}

function determineBackground6502(squareX: number, squareY: number): IBackground {
    mustBeBytes(squareX, squareY);

    const cpu = newExileCPU();

    cpu.write8(X.square_x, squareX);
    cpu.write8(X.square_y, squareY);
    callRoutine(cpu, X.determine_background);

    assert.ok(cpu.read8(X.square_sprite) === cpu.a);

    const result = {
        squareSprite: cpu.read8(X.square_sprite),
        squareOrientation: cpu.read8(X.square_orientation),
    };

    return result;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface IBackground2 {
    thisObjectSprite: number;
    objectFlippingFlags: number;
    //spriteFlippingFlags: number;
    palette: number;
    xLow: number;
    yLow: number;
    squareSprite: number;
    calculateBackgroundSquareSprite: number;
}

function setupBackgroundSpriteValues6502(squareX: number, squareY: number): IBackground2 {
    mustBeBytes(squareX, squareY);

    let calculateBackgroundSquareSprite;
    {
        const cpu = newExileCPU();

        cpu.write8(X.square_x, squareX);
        cpu.write8(X.square_y, squareY);
        callRoutine(cpu, X.calculate_background);
        calculateBackgroundSquareSprite = cpu.a & 0x3f;//cpu.read8(X.square_sprite);
    }

    const cpu = newExileCPU();

    cpu.write8(X.square_x, squareX);
    cpu.write8(X.square_y, squareY);
    //cpu.write8(X.background_processing_flag);
    callRoutine(cpu, X.setup_background_sprite_values);

    const result = {
        squareSprite: cpu.read8(X.square_sprite),
        thisObjectSprite: cpu.read8(X.this_object_sprite),
        objectFlippingFlags: cpu.read8(X.this_object_flipping_flags),
        //spriteFlippingFlags: cpu.read8(X.this_sprite_flipping_flags),
        palette: cpu.read8(X.this_object_palette),
        xLow: cpu.read8(X.this_object_x_low),// >> 3,
        yLow: cpu.read8(X.this_object_y_low),// >> 3,
        calculateBackgroundSquareSprite,
    };
    return result;
}

function createPNG(width: number, height: number, r: number, g: number, b: number, a: number): pngjs.PNG {
    const png = new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width, height });

    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i + 0] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = a;
    }

    return png;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

function doBackground() {
    const miniMapPNG = createPNG(256, 256, 0, 0, 0, 255);//new pngjs.PNG({ colorType: PNG_COLOUR_TYPE_RGBA, width: 256, height: 256 });

    const fullMapPNG = createPNG(256 * SQUARE_WIDTH, 256 * SQUARE_HEIGHT, 0, 0, 0, 255);

    const backgrounds: IBackground2[][] = [];
    let numFlipped = 0;

    for (let squareY = 0; squareY < 256; ++squareY) {
        p('squareY: ' + hex2(squareY) + '\r');
        if (process.stderr.isTTY !== true) {
            pn('');
        }
        const backgroundRow: IBackground2[] = [];
        backgrounds.push(backgroundRow);
        for (let squareX = 0; squareX < 256; ++squareX) {
            const background = setupBackgroundSpriteValues6502(squareX, squareY);
            backgroundRow.push(background);

            let spriteX = squareX * SQUARE_WIDTH + (background.xLow >> 4);
            let spriteY = squareY * SQUARE_HEIGHT + (background.yLow >> 3);

            const flippingFlags = background.objectFlippingFlags;// ^ background.spriteFlippingFlags;

            let flipX = (flippingFlags & 0x80) !== 0;
            let flipY = (flippingFlags & 0x40) !== 0;

            // if ((gExile[X.background_sprite_lookup + background.squareSprite] & 0x80) !== 0) {
            //     flipY = !flipY;
            // }

            putSprite(fullMapPNG, spriteX, spriteY, background.thisObjectSprite, flipX, flipY, background.palette);
        }
    }

    for (let y = 0; y < 256 * SQUARE_HEIGHT; ++y) {
        for (let x = 0; x < 256 * SQUARE_WIDTH; ++x) {
            if (x % SQUARE_WIDTH === 0 || y % SQUARE_HEIGHT === 0) {
                setPixel(fullMapPNG, x, y, [.5, .5, .5]);
            }
        }
    }

    pn('');

    pn('numFlipped=' + numFlipped);

    pn('Save mini map...');
    savePNG(miniMapPNG, './output/map1.png');

    pn('Save full map...');
    savePNG(fullMapPNG, './output/bigmap.png');

    for (let squareY = 0; squareY < 256; ++squareY) {
        for (let squareX = 0; squareX < 256; ++squareX) {
            const x = squareX * SQUARE_WIDTH;
            const y = squareY * SQUARE_HEIGHT;
            const background = backgrounds[squareY][squareX];

            printStr(fullMapPNG, x + 1, y + 1, hex2(squareX) + hex2(squareY));
            printStr(fullMapPNG, x + 1, y + 7, hex2(background.calculateBackgroundSquareSprite));//hex2(background.squareSprite) + hex2(background.thisObjectSprite));
            printStr(fullMapPNG, x + 1, y + 14, hex2(background.objectFlippingFlags));
            // printStr(fullMapPNG, x, y + 6, hex2(background.squareSprite) + hex2(background.squareOrientation));
            // printStr(fullMapPNG, x, y + 12, hex2(gExile[X.background_sprite_lookup + background.squareSprite]));
        }
    }

    pn('Save full map + overlay...');
    savePNG(fullMapPNG, './output/bigmap_overlay.png');
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

interface ICommandLineOptions {
    test_6502: string | null;
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

async function main(options: ICommandLineOptions) {
    if (options.test_6502 !== null) {
        pn('running test suite...');
        CPU.runLorenzTestSuite(options.test_6502, true);
    }

    const exileb = fs.readFileSync('../../tmp/exileb.new');
    pn('loaded exileb: ' + exileb.length + ' bytes');

    gExile = Buffer.alloc(0x100 + exileb.length);
    exileb.copy(gExile, 0x100);

    try {
        fs.mkdirSync('./output/');
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }

    doSpritePage();
    doSprites();
    doBackground();
}

/////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////

{
    const parser = new argparse.ArgumentParser({
        addHelp: true,
        description: 'Exile map/sprites hackery'
    });

    parser.addArgument(['--test-6502'], { metavar: 'PATH', help: 'test 6502 emulator against Lorenz test suite (built for ASCII) stored at PATH' });

    const options = parser.parseArgs();

    main(options).then(() => {
        //process.('main promise completed');
    }).catch((error) => {
        process.stderr.write('Stack trace:\n');
        process.stderr.write(error.stack + '\n');
        process.stderr.write('FATAL: ' + error + '\n');
        process.exit(1);
    });
}
