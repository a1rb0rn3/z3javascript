/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 */



/**
 * A node.js API for Z3. Currently, all objects only increment ref counts but never decrement.
 * Ideally, a garbage collector would call a finalizer on the objects that then decrements the
 * ref counts.
 */

const Expr = require('./Expr');
const Model = require('./Model');
const Context = require('./Context');
const Solver = require('./Solver');
const Regex = require('./Regex');
const Query = require('./Query');
const Check = require('./Check');

let API = {};

API.Solver = Solver;
API.Context = Context;
API.Model = Model;
API.Expr = Expr;
API.Regex = Regex;
API.Query = Query;
API.Check = Check;

module.exports = API