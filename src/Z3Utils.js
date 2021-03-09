/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 */


/**
 * Recursively reduce Expr to AST
 */
function astArray(args) {
	return args.map(a => {

		if (a instanceof Array) {
			return astArray(a);
		}

		return a.ast || a;
	});
}

const Z3Utils = {
	wrap: function(ctx, ret) {
		return ret;
	},
	astArray: astArray
};

module.exports = Z3Utils
