# Common-password list (D-063)

`common-passwords.txt` is derived from SecLists:

- **Source:** `Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt`
- **Commit:** `c205c36a445bff37f8e58a9ec829105cd4975c58`
- **URL:** https://github.com/danielmiessler/SecLists/blob/c205c36a445bff37f8e58a9ec829105cd4975c58/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt
- **Source file:** 100,000 lines, SHA-256 `1472aafa2561df5e3293aee252aee3ca660c12b399a283cf808bb01b39be388b`
- **Filter:** keep entries of 12 or more characters, lower-cased, de-duplicated and sorted. Shorter entries can never pass the 12-character minimum, so they are not needed.
- **Result:** 483 entries.

Regenerate:

```sh
curl -sSfL https://raw.githubusercontent.com/danielmiessler/SecLists/c205c36a445bff37f8e58a9ec829105cd4975c58/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt \
  | tr -d '\r' | awk 'length($0)>=12' | LC_ALL=C tr 'A-Z' 'a-z' | LC_ALL=C sort -u > common-passwords.txt
```

## Licence (SecLists, MIT)

    MIT License
    
    Copyright (c) 2018 Daniel Miessler
    
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
