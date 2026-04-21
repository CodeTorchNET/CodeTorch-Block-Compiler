## CodeTorch Block Compiler

This repository contains a modified version of **TurboWarp** (itself a modified version of Scratch) adapted for the CodeTorch project.

### Building
```
git clone https://github.com/CodeTorchNET/CodeTorch-Block-Compiler
cd CodeTorch-Block-Compiler

npm ci

nano .env # modify/create .env files (read more below)

npm start # starts it at localhost:8601
```

the .env accepts the following:
```
APP_NAME=CodeTorch
FORCE_EMBED=false # you should probably leave this false
COLLABORATION_DEV_MODE=false

APP_DOMAIN=USELESS_FOR_MOST_DEV_CASES
API_HOST=USELESS_FOR_MOST_DEV_CASES
ASSET_HOST=USELESS_FOR_MOST_DEV_CASES
EXTENSION_HOST=USELESS_FOR_MOST_DEV_CASES
DEFAULT_CLOUD_HOST=USELESS_FOR_MOST_DEV_CASES
TRUSTED_IFRAME_HOST=USELESS_FOR_MOST_DEV_CASES
COLLABORATION_HOST=USELESS_FOR_MOST_DEV_CASES
```

### Licensing

* **GPLv3 Code**  
  All code modifications to TurboWarp/Scratch are licensed under the GNU General Public License version 3 (GPLv3), per the original license terms.

* **Proprietary Assets**  
  The SVG files located at:

  - `src/lib/default-project/frame1.svg`  
  - `src/lib/default-project/frame2.svg`

  are **not** covered by AGPL. They are proprietary to CodeTorch and licensed only for use within the CodeTorch ecosystem. Redistribution or modification outside CodeTorch is prohibited without express written consent.

---

# Why is the rest of CodeTorch closed-source?

For a detailed explanation of our licensing approach and how we comply with open-source requirements, please see [LICENSING_CLARIFICATION.md](./LICENSING_CLARIFICATION.md).

---


<br>
<br>

README from original turbowarp repository:
## Setup

See https://docs.turbowarp.org/development/getting-started to setup the complete TurboWarp environment.

If you just want to play with the GUI then it's the same process as upstream scratch-gui.

## License

TurboWarp's modifications to Scratch are licensed under the GNU General Public License v3.0. See LICENSE or https://www.gnu.org/licenses/ for details.

The following is the original license for scratch-gui, which we are required to retain. This is NOT the license of this project.

```
Copyright (c) 2016, Massachusetts Institute of Technology
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
