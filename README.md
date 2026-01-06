# NodeProjectDater
Get estimated (pretty much precise!) date range of a package.json file, to find out when a Node.js project had last updated its dependencies  

The more dependencies there are, the higher the precision is.
> When using frameworks, the estimation often narrows down to a certain day!

Useful when file timestamps are lost

## Usage
```bash
npm run date /path/to/package.json
```
or
```bash
node app.js /path/to/package.json
```