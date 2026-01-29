import fs from "fs";

export class ByteReader {
  private offset: number;
  private readonly buffer: Buffer;

  constructor(buffer: Buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  readByte(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readShort(): number {
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt(): number {
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readDouble(): number {
    const value = this.buffer.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Buffer {
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  remaining(): number {
    return this.buffer.length - this.offset;
  }

  position(): number {
    return this.offset;
  }

  setPosition(position: number): void {
    this.offset = position;
  }
}

export class ByteWriter {
  private readonly chunks: Buffer[] = [];

  writeByte(value: number): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value & 0xff, 0);
    this.chunks.push(buf);
  }

  writeBytes(buffer: Buffer): void {
    if (buffer.length > 0) {
      this.chunks.push(buffer);
    }
  }

  writeShort(value: number): void {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(value, 0);
    this.chunks.push(buf);
  }

  writeInt(value: number): void {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value, 0);
    this.chunks.push(buf);
  }

  writeDouble(value: number): void {
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(value, 0);
    this.chunks.push(buf);
  }

  writeString(value: string): void {
    this.writeBytes(Buffer.from(value, "utf8"));
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  writeToFile(path: string): void {
    fs.writeFileSync(path, this.toBuffer());
  }
}
