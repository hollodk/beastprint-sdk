Rules for printing:

- beast.mode = 'template|html' should be able to switch dynamic, depending on if its printing as html or template

- first priority is beastprint
- check for beast.template, use that
- then check for html in beast.html, use that
- then check for url in beast.url, use that
- then check for global html, use that
- then check for global url, use that

- second priority is printdesk
- check for html in printdesk.html, use that
- then check for url in printdesk.url, use that
- then check for beast.template, if set use print.beastscan.com/render/html to generate global html
- then check for global html, use that
- then check for url in global url

- third priority is legacy
- check for html in legacy.html, use that
- then check for url in legacy.url, use that
- then check for beast.template, if set use print.beastscan.com/render/html to generate global html
- then check for global html, use that
- then check for url in global url

