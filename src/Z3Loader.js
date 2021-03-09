/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 */
const Z3Loader = require("./package").default;
const Z3Path = process && process.env.Z3_PATH ? process.env.Z3_PATH : undefined;
let Z3 = Z3Loader(Z3Path);

module.exports = Z3
