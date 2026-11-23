/**
 * GDFU wire-format tests mirroring gdfu-bootloader tests/test-vectors.json (docs/PROTOCOL_DFU_GFSK.md).
 * Framework-free: `npm test` runs this via tsx assert mode.
 */

import assert from "node:assert/strict";
import { crc16Nordic } from "./firmware";
import { parseStatus } from "./bluetooth";

// STATUS frame: byte 10 (ACK RSSI) is a trailing extension; older 10-byte frames keep working.
{
  const frame = new DataView(Uint8Array.of(3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0xF0).buffer);
  const parsed = parseStatus(frame);
  assert.equal(parsed?.ackRssi, -16);
  const legacy = parseStatus(new DataView(Uint8Array.of(3, 0, 0, 1, 0, 0, 0, 1, 0, 0).buffer));
  assert.equal(legacy?.ackRssi, null);
  const none = parseStatus(new DataView(Uint8Array.of(3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0).buffer));
  assert.equal(none?.ackRssi, null);
}

const HEADER_SIZE = 30;
const CRC_SIZE = 4;
const MAGIC = [0x47, 0x44, 0x46, 0x55]; // "GDFU"

export interface GdfuFrame {
  packetType: number;
  profile: number;
  targetId: number;
  sessionId: bigint;
  sequence: number;
  offset: number;
  payload: Uint8Array;
}

function crc32ieee(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeFrame(frame: GdfuFrame): Uint8Array {
  const out = new Uint8Array(HEADER_SIZE + frame.payload.length + CRC_SIZE);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint8(4, 1); // version
  view.setUint8(5, frame.packetType);
  view.setUint8(6, frame.profile);
  view.setUint8(7, 0); // flags
  view.setUint32(8, frame.targetId, false);
  view.setBigUint64(12, frame.sessionId, false);
  view.setUint32(20, frame.sequence, false);
  view.setUint32(24, frame.offset, false);
  view.setUint16(28, frame.payload.length, false);
  out.set(frame.payload, HEADER_SIZE);
  view.setUint32(
    HEADER_SIZE + frame.payload.length,
    crc32ieee(out.subarray(0, HEADER_SIZE + frame.payload.length)),
    false,
  );
  return out;
}

export function decodeFrame(raw: Uint8Array): GdfuFrame {
  if (raw.length < HEADER_SIZE + CRC_SIZE) {
    throw new Error("frame too short");
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(raw[i], MAGIC[i], "bad magic");
  }
  assert.equal(view.getUint8(4), 1, "unsupported version");
  assert.equal(view.getUint8(7), 0, "unsupported flags");
  const length = view.getUint16(28, false);
  assert.equal(raw.length, HEADER_SIZE + length + CRC_SIZE, "length mismatch");
  const expected = view.getUint32(HEADER_SIZE + length, false);
  assert.equal(crc32ieee(raw.subarray(0, HEADER_SIZE + length)), expected, "CRC mismatch");
  return {
    packetType: view.getUint8(5),
    profile: view.getUint8(6),
    targetId: view.getUint32(8, false),
    sessionId: view.getBigUint64(12, false),
    sequence: view.getUint32(20, false),
    offset: view.getUint32(24, false),
    payload: raw.slice(HEADER_SIZE, HEADER_SIZE + length),
  };
}

// --- self-check (run with `npm test`) -------------------------------------------

const VECTOR_HEX = "47444655010401000102030401020304050607080A0B0C0D101112130002AABB67F3218B";
const VECTOR_CORRUPT = VECTOR_HEX.slice(0, -2) + "8A";

function fromHex(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function runCodecTests(): void {
  const vector = fromHex(VECTOR_HEX);
  const decoded = decodeFrame(vector);
  assert.equal(decoded.packetType, 4);
  assert.equal(decoded.profile, 1);
  assert.equal(decoded.targetId, 0x01020304);
  assert.equal(decoded.sessionId, 0x0102030405060708n);
  assert.equal(decoded.sequence, 0x0a0b0c0d);
  assert.equal(decoded.offset, 0x10111213);
  assert.deepEqual([...decoded.payload], [0xaa, 0xbb]);
  assert.equal(toHex(encodeFrame(decoded)), VECTOR_HEX, "round-trip");

  assert.throws(() => decodeFrame(fromHex(VECTOR_CORRUPT)), /CRC mismatch/);

  // Nordic CRC16 reference: empty -> 0xFFFF; "123456789" -> 0x29B1.
  assert.equal(crc16Nordic(new Uint8Array(0)), 0xffff);
  assert.equal(crc16Nordic(new TextEncoder().encode("123456789")), 0x29b1, "CRC16 check value");
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("codec.test.ts")) {
  runCodecTests();
  console.log("codec tests passed");
}
