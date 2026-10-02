#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
python3 tools/prepare_fonts.py
python3 tools/prepare_cartridge.py
"${PASMO:-pasmo}" --bin build/cartridge-engine.asm build/cartridge-engine.bin build/cartridge-engine.sym
python3 tools/package_cartridge.py --equates
"${PASMO:-pasmo}" --bin build/cartridge-extra-fonts.asm build/cartridge-extra-fonts.bin build/cartridge-extra-fonts.sym
"${PASMO:-pasmo}" --bin build/cartridge-rtf.asm build/cartridge-rtf.bin build/cartridge-rtf.sym
"${PASMO:-pasmo}" --bin build/cartridge-code.asm build/cartridge-code.bin build/cartridge-code.sym
"${PASMO:-pasmo}" --bin src/cartridge/gateway.asm build/cartridge-gateway.bin build/cartridge-gateway.sym
"${PASMO:-pasmo}" --bin src/cartridge/boot.asm build/cartridge-boot.bin build/cartridge-boot.sym
python3 tools/package_cartridge.py
