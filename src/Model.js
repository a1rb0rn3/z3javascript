/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 */

const Z3 = require('./Z3Loader');
const Expr = require('./Expr');

class Model {
	constructor(context, model) {
		this.context = context;
		this.mdl = model;
		Z3.Z3_model_inc_ref(this.context.ctx, this.mdl);
	}

	toString() {
		return Z3.Z3_model_to_string(this.context.ctx, this.mdl);
	}

	eval(expr) {
		let res = Z3.bindings_model_eval(this.context.ctx, this.mdl, expr.ast);
		//TODO: Propogating array lengths like this is horrible, find a better way
		return res ? (new Expr(this.context, res)).setLength(expr.getLength()).setFields(expr.getFields()) : null;
	}

	destroy() {
		Z3.Z3_model_dec_ref(this.context.ctx, this.mdl);
	}
}

module.exports = Model;
