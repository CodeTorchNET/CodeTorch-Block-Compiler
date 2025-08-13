# Licensing Clarification for TurboWarp Fork

## Plain-English Explanation

* **Open-Source Frontend (GPLv3):** The modified TurboWarp code in this repository is fully open source under **GNU GPL version 3**. We provide the complete source and license text here, so we are in full compliance with GPLv3. All changes to the TurboWarp frontend are also released under GPLv3.

* **Separate Proprietary Backend:** Our system also has a proprietary backend API (for saving/loading projects) and a proprietary main frontend (on another domain). **These are not included or distributed in this repository.** They remain private and closed-source.

* **Normal Web Communication:** The TurboWarp frontend (served from `blockcompiler.codetorch.net`) runs in the browser and talks to our backend over regular HTTP/REST calls. This is just like any two separate programs talking over the network. According to the Free Software Foundation’s GPL FAQ, communication via sockets/HTTP is a **normal arms‑length interface** between independent programs. In other words, embedding the GPL frontend in an iframe and calling the backend API does **not** fuse them into one combined program.

* **No “GPL Infection” Across Network:** Because the frontend and backend only communicate over the network, the backend remains independent. The GPL’s copyleft only “infects” derived works that are distributed together as one program. Since our backend is neither combined into the GPL code nor distributed with it, the GPL does not require the backend’s source to be disclosed.

* **No Distribution of Backend Code:** Crucially, we never distribute the proprietary backend code (nor the proprietary frontend code). The GPL’s requirements kick in only when you “convey” or distribute the software. Running the software on our servers and letting users interact with it does **not** count as distributing it under GPLv3. The GPL FAQ explicitly says a company can run a modified GPL program on a website **without** releasing its source, because it was never actually conveyed to users.

* **Bottom Line for Developers:** In simple terms, **we comply fully with GPLv3 for the TurboWarp frontend**, and we clarify that the closed-source backend/main frontend are entirely separate. Calling our API from the GPL frontend does not impose GPL obligations on the backend. This setup (open GPL frontend + closed proprietary backend) is a common approach: it allows everyone to use and improve the open client code while keeping the private server code proprietary.

## Formal Legal Notice

1. **GPLv3 Frontend Compliance:** The TurboWarp-derived code in this repository is licensed under the **GNU General Public License version 3 (GPLv3)**. All source code for the modified frontend is made available here under GPLv3, in accordance with Section 6 of the GPLv3. This ensures full compliance with the license terms for any distributed or modified copies of the frontend.

2. **Separate Proprietary Components:** The proprietary backend API and the proprietary main frontend (hosted on a separate domain) are independent programs. They communicate with the GPL-licensed frontend solely via standard web protocols (HTTP/REST). As the Free Software Foundation’s GPL FAQ explains, communication by sockets or HTTP “is normally used between two separate programs”.  Therefore, these proprietary components are **not combined** into the GPL-covered work, but merely **aggregated** with it in an arms‑length fashion.

3. **No Derivative Work or GPL Extension:** Because the frontend and backend remain separate programs, the proprietary backend and frontend code are **not derivative works** of the GPL code. Consequently, the GPLv3 copyleft obligations do not extend to those proprietary components. This is consistent with GPL guidance that distributing GPL software alongside proprietary software with only network-level communication does **not** force the proprietary code to become GPL.

4. **Non-Distribution of Backend Code:** The proprietary backend code is **never distributed** in binary or source form to users of this project. Under GPLv3, obligations to provide source apply only to conveyed copies. As noted in the GPL FAQ, running or serving a GPL program on a server (“making it available over a network”) does not count as distribution of the program itself. Thus, since the backend is only accessed remotely and not conveyed, GPLv3 imposes no requirement to disclose its source. (Had a network distribution trigger been desired, an Affero GPL would be required; see FSF explanation.)

5. **Conclusion:** In summary, all code in this repository remains under GPLv3 and fully complies with that license. The proprietary backend and proprietary main frontend are independent and closed-source, and their interaction with the GPL frontend via HTTP/iframe does not violate GPLv3. This structure is legally permissible under GPLv3 as interpreted by the FSF. Users are free to use, modify, and redistribute the TurboWarp frontend code under GPLv3, and the proprietary components remain exempt from GPL source-disclosure obligations because they are not derived from or distributed with the GPL-covered code.

**Sources:** This notice is based on the GNU GPLv3 license text and the FSF’s GNU GPL FAQ guidance, including clarifications that networked communication (sockets/HTTP) between GPL and non-GPL software generally does not create a single combined work, and that running a modified GPL program on a server without distributing it does not require publishing its source. These principles ensure that our use of the proprietary API and frontend does not extend GPL obligations beyond the open TurboWarp code.
