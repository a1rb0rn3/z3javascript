/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 */

const Z3 = require('./Z3Loader');
const Z3Utils = require('./Z3Utils');
const Expr = require('./Expr');

class Context {

	constructor() {
		let config = Z3.Z3_mk_config();

		Z3.Z3_set_param_value(config, "model", "true");

		this.ctx = Z3.Z3_mk_context_rc(config);
		Z3.Z3_del_config(config);
	}

	_nullExpr() {
		return new Expr(this, null);
	}

	_appendList(list, l2) {
		return l2 ? list.concat(l2) : list;
	}

	/**
     * TODO: is not recursive on array
     */
	_buildChecks(args) {
		return args.filter(next => next.checks).reduce((last, next) => this._appendList(last, next.checks), []);
	}

	_build(func, ...args) {
		return this._buildConst.apply(this, [func, this._buildChecks(args, false)].concat(Z3Utils.astArray(args)));
	}

	_buildConst(func, checks, ...args) {
		let fnResult = func.apply(this, [this.ctx].concat(args));
		return new Expr(this, fnResult, checks);      
	}

	_buildVar(func, ...args) {
		return this._buildVarNoArgs(func, args);
	}

	_buildVarNoArgs(func, args) {
		return new Expr(this, func(this.ctx, args.length, Z3Utils.astArray(args)), this._buildChecks(args, false));
	}

	destroy() {
		return this._build(Z3.Z3_del_context);
	}

	incRef(e) {
		Z3.Z3_inc_ref(this.ctx, e.ast);
	}

	decRef(e) {
		Z3.Z3_dec_ref(this.ctx, e.ast);
	}

	mkApp(func, args) {
		return this._build(Z3.Z3_mk_app, func, args.length, args);
	}

	mkArray(name, baseSort) {
		let arraySort = this.mkArraySort(this.mkIntSort(), baseSort);
		let arrayInstance = this.mkVar(name, arraySort);
		let arrayLen = this.mkIntVar(name + "_Array_Length");
		return arrayInstance.setLength(arrayLen);
	}

	mkBvArray32(name) {
		let arraySort = this.mkArraySort(this.mkBvSort(32), this.mkBvSort(32));
		let arrayInstance = this.mkVar(name, arraySort);
		let arrayLen = this.mkBvVar(name + "_Array_Length", 32);
		return arrayInstance.setLength(arrayLen);
	}

	mkBvArray64(name) {
		let arraySort = this.mkArraySort(this.mkBvSort(64), this.mkBvSort(64));
		let arrayInstance = this.mkVar(name, arraySort);
		let arrayLen = this.mkBvVar(name + "_Array_Length", 64);
		return arrayInstance.setLength(arrayLen);
	}

	mkObject(name, baseSort) {
		let objectSort = this.mkArraySort(this.mkStringSort(), baseSort);
		let objectInstance = this.mkVar(name, objectSort);
		return objectInstance;
	}

	mkGetSort(e) {
		return Z3.Z3_get_sort(this.ctx, e.ast);
	}

	mkSortKind(sort) {
		return Z3.Z3_get_sort_kind(this.ctx, sort);
	}

	mkSortName(sort) {
		return Z3.Z3_get_sort_name(this.ctx, sort);
	}

	mkSymbolString(s) {
		return Z3.Z3_get_symbol_string(this.ctx, s);
	}

	mkVar(name, sort) {
		return this._build(Z3.Z3_mk_const, this.mkStringSymbol(name), sort);
	}

	mkIntVar(name) {
		return this.mkVar(name, this.mkIntSort());
	}

	mkBvVar(name, size) {
		return this.mkVar(name, this.mkBvSort(size))
	}

	mkRealVar(name) {
		return this.mkVar(name, this.mkRealSort());
	}

	mkBoolVar(name) {
		return this.mkVar(name, this.mkBoolSort());
	}

	mkString(val) {
		return this._buildConst(Z3.Z3_mk_string, [], val);
	}

	mkStringVar(name) {
		return this.mkVar(name, this.mkStringSort());
	}

	mkIntVal(val) {
		return this.mkInt(val, this.mkIntSort());
	}

	mkBvValS(val, size) {
		if (size < 64) {
			return this.mkInt(val, this.mkBvSort(size))
		} else {
			return this.mkInt64(val, this.mkBvSort(size))
		}
	}

	mkUnsignedIntVal(val) {
		return this.mkUnsignedInt(val, this.mkIntSort());
	}

	mkBvValU(val, size) {
		if (size < 64) {
			return this.mkUnsignedInt(val, this.mkBvSort(size))
		} else {
			return this.mkUnsignedInt64(val, this.mkBvSort(size))
		}
	}

	mkSeqLength(val) {
		return this._build(Z3.Z3_mk_seq_length, val);
	}
    
	mkSeqAt(val, off) {
		return this._build(Z3.Z3_mk_seq_at, val, off);
	}
   
	mkSeqContains(val1, val2) {
		return this._build(Z3.Z3_mk_seq_contains, val1, val2);
	}
    
	mkSeqConcat(strings) {
		return this._buildVarNoArgs(Z3.Z3_mk_seq_concat, strings);
	}
    
	mkSeqSubstr(str, offset, length) {
        
		if (!length) {
			length = this._nullExpr();
		}
        
		return this._build(Z3.Z3_mk_seq_extract, str, offset, length);
	}
    
	mkSeqIndexOf(str, str2, off) {
		return this._build(Z3.Z3_mk_seq_index, str, str2, off);
	}

	mkStrToInt(str) {
		return this._build(Z3.Z3_mk_str_to_int, str);
	}

	mkIntToStr(num) {
		return this._build(Z3.Z3_mk_int_to_str, num);
	}

	mkSeqInRe(seq, re) {
		return this._build(Z3.Z3_mk_seq_in_re, seq, re);
	}

	mkReConcat(re1, re2) {
		return this._buildVar(Z3.Z3_mk_re_concat, re1, re2);
	}

	mkReEmpty() {
		return this._build(Z3.Z3_mk_re_empty, this.mkReSort(this.mkStringSort()));
	}

	mkReFull() {
		return this._build(Z3.Z3_mk_re_full, this.mkStringSort());
	}

	mkReOption(re) {
		return this._build(Z3.Z3_mk_re_option, re);
	}

	mkReStar(re) {
		return this._build(Z3.Z3_mk_re_star, re);
	}

	mkReUnion(re1, re2) {
		return this._buildVar(Z3.Z3_mk_re_union, re1, re2);
	}

	mkReIntersect(re1, re2) {
		return this._buildVar(Z3.Z3_mk_re_intersect, re1, re2);
	}

	mkReComplement(re) {
		return this._build(Z3.Z3_mk_re_complement, re);
	}

	mkRePlus(re) {
		return this._build(Z3.Z3_mk_re_plus, re);
	}

	mkReRange(ch1, ch2) {
		return this._build(Z3.Z3_mk_re_range, ch1, ch2);
	}

	mkReLoop(re, lo, hi) {
		return this._build(Z3.Z3_mk_re_loop, re, lo, hi);
	}

	mkSeqToRe(seq) {
		return this._build(Z3.Z3_mk_seq_to_re, seq);
	}

	isString(ast) {
		return this.build(Z3.Z3_is_string, ast) === Z3.TRUE;
	}

	mkBoolSort() {
		return Z3.Z3_mk_bool_sort(this.ctx);
	}

	mkStringSort() {
		return Z3.Z3_mk_string_sort(this.ctx);
	}

	mkIntSort() {
		return Z3.Z3_mk_int_sort(this.ctx);
	}

	mkBvSort(size) {
		return Z3.Z3_mk_bv_sort(this.ctx, size);
	}

	mkSeqSort(sort) {
		return Z3.Z3_mk_seq_sort(this.ctx, sort);
	}

	mkReSort(sort) {
		return Z3.Z3_mk_re_sort(this.ctx, sort);
	}

	mkIntSymbol(val) {
		return Z3.Z3_mk_int_symbol(this.ctx, val);
	}

	mkStringSymbol(val) {
		return Z3.Z3_mk_string_symbol(this.ctx, val);
	}

	mkConst(symb, sort) {
		return this._build(Z3.Z3_mk_const, symb, sort);
	}

	mkFunc(name, args, sort) {
		return this._build(Z3.Z3_mk_func_decl, name, args.length, args, sort);
	}

	mkRecFunc(name, args, sort) {
		return this._build(Z3.Z3_mk_rec_func_decl, name, args.length, args, sort);
	}

	mkRecFuncDef(fn, args, body) {
		return this._build(Z3.Z3_add_rec_func_decl, fn, args.length, args, body);
	}

	/**
     * Propositional logic and equality
     */

	mkTrue() {
		return this._build(Z3.Z3_mk_true);
	}

	mkFalse() {
		return this._build(Z3.Z3_mk_false);
	}

	mkEq(left, right) {
		return this._build(Z3.Z3_mk_eq, left, right);
	} 

	//missing: distinct

	mkNot(arg) {
		return this._build(Z3.Z3_mk_not, arg);
	}

	mkBvNot(arg) {
		return this._build(Z3.Z3_mk_bvnot, arg);
	}

	mkIte(ifarg, thenarg, elsearg) {
		return this._build(Z3.Z3_mk_ite, ifarg, thenarg, elsearg);
	}

	mkIff(left, right) {
		return this._build(Z3.Z3_mk_iff, left, right);
	}

	mkImplies(left, right) {
		return this._build(Z3.Z3_mk_implies, left, right);
	}

	mkXOr(left, right) {
		return this._build(Z3.Z3_mk_xor, left, right);
	}

	mkBvXOr(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvxor, arg1, arg2);
	}

	mkAnd(left, right) {
		return this._buildVar(Z3.Z3_mk_and, left, right);
	}

	mkBvAnd(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvand, arg1, arg2);
	}

	mkAndList(conditions) {
		return this._buildVarNoArgs(Z3.Z3_mk_and, conditions);
	}

	mkOr(left, right) {
		return this._buildVar(Z3.Z3_mk_or, left, right);
	}

	mkBvOr(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvor, arg1, arg2);
	}

	/**
     * Arithmetic: Integers and Reals
     */

	mkRealSort() {
		return Z3.Z3_mk_real_sort(this.ctx);
	}

	mkDoubleSort() {
		return Z3.Z3_mk_fpa_sort_64(this.ctx);
	}

	mkAdd(left, right) {
		return this._buildVar(Z3.Z3_mk_add, left, right);
	}

	mkBvAdd(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvadd, arg1, arg2);
	}

	mkMul(left, right) {
		return this._buildVar(Z3.Z3_mk_mul, left, right);
	}

	mkBvMul(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvmul, arg1, arg2);
	}

	mkSub(left, right) {
		return this._buildVar(Z3.Z3_mk_sub, left, right);
	}

	mkBvSub(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvsub, arg1, arg2);
	}

	mkUnaryMinus(arg) {
		return this._build(Z3.Z3_mk_unary_minus, arg);
	}

	mkDiv(arg1, arg2) {
		return this._build(Z3.Z3_mk_div, arg1, arg2);
	}

	mkBvUDiv(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvudiv, arg1, arg2);
	}

	mkBvSDiv(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvsdiv, arg1, arg2);
	}

	mkBvShl(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvshl, arg1, arg2);
	}

	mkBvShr(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvlshr, arg1, arg2);
	}

	mkMod(arg1, arg2) {
		return this._build(Z3.Z3_mk_mod, arg1, arg2);
	}

	mkRem(arg1, arg2) {
		return this._build(Z3.Z3_mk_rem, arg1, arg2);
	}

	mkPower(arg1, arg2) {
		return this._build(Z3.Z3_mk_power, arg1, arg2);
	}

	mkLt(left, right) {
		return this._build(Z3.Z3_mk_lt, left, right);
	}

	mkBvLtS(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvslt, arg1, arg2);
	}

	mkBvLtU(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvult, arg1, arg2);
	}

	mkLe(left, right) {
		return this._build(Z3.Z3_mk_le, left, right);
	}

	mkBvLeS(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvsle, arg1, arg2);
	}

	mkBvLeU(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvule, arg1, arg2);
	}

	mkGt(left, right) {
		return this._build(Z3.Z3_mk_gt, left, right);
	}

	mkBvGtS(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvsgt, arg1, arg2);
	}

	mkBvGtU(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvugt, arg1, arg2);
	}

	mkGe(left, right) {
		return this._build(Z3.Z3_mk_ge, left, right);
	}

	mkBvGeS(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvsge, arg1, arg2);
	}

	mkBvGeU(arg1, arg2) {
		return this._build(Z3.Z3_mk_bvuge, arg1, arg2);
	}

	mkRealToInt(real) {
		return this._build(Z3.Z3_mk_real2int, real);
	}

	mkIntToReal(ival) {
		return this._build(Z3.Z3_mk_int2real, ival);
	}

	mkIntToBv(ival) {
		return this._build(Z3.Z3_mk_int2bv, 32, ival);
	}

	mkBvToInt(bval) {
		return this._build(Z3.Z3_mk_bv2int, bval, true);
	}

	mkIsInt(arg) {
		return this._build(Z3.Z3_mk_is_int, arg);
	}

	/**
     * Numerals
     */

	mkNumeral(numeral, sort) {
		return this._build(Z3.Z3_mk_numeral, numeral, sort);
	}

	mkReal(num, den) {
		return this._build(Z3.Z3_mk_real, num, den);
	}

	mkInt(v, sort) {
		return this._build(Z3.Z3_mk_int, v, sort);
	}

	mkUnsignedInt(v, sort) {
		return this._build(Z3.Z3_mk_unsigned_int, v, sort);
	}

	mkInt64(v, sort) {
		return this._build(Z3.Z3_mk_int64, v, sort);
	}

	mkUnsignedInt64(v, sort) {
		return this._build(Z3.Z3_mk_unsigned_int64, v, sort);
	}

	mkToString(e) {
		return Z3.Z3_ast_to_string(this.ctx, e.ast || e);
	}

	/**
     * Arrays
     */

	mkArraySort(indexSort, elemSort) {
		return this._build(Z3.Z3_mk_array_sort, indexSort, elemSort);
	}

	mkSelect(array, index) {
		return this._build(Z3.Z3_mk_select, array, index);
	}

	mkStore(array, index, v) {
		return this._build(Z3.Z3_mk_store, array, index, v)
			.setLength(array.getLength());
	}

	mkConstArray(sort, v) {
		return this._build(Z3.Z3_mk_const_array, sort, v)
			.setLength(this.mkIntVal(v.length));
	}

	/**
     * Quantifiers
     * SEE: https://stackoverflow.com/questions/9777381/c-api-for-quantifiers
     */

	/// https://z3prover.github.io/api/html/group__capi.html#gaa80db40fee2eb0124922726e1db97b43
	mkBound(index, sort) {
		return this._build(Z3.Z3_mk_bound, index, sort);
	}

	/// Weight, and patterns are optional. Bound should be an array of consts.
	mkForAllConst(bound, body, patterns = [], weight = 0) {
		return this._build(Z3.mkForAllConst, weight, bound.length, bound, patterns.length, patterns, body);
	}

	mkForAll(decl_names, sorts, body, patterns = [], weight = 0) {
		return this._build(Z3.Z3_mk_forall, weight, patterns.length, patterns, decl_names.length, [sorts], decl_names, body);
	}

	mkExists(decl_names, sorts, body, patterns = [], weight = 0) {
		return this._build(Z3.Z3_mk_exists, weight, patterns.length, patterns, decl_names.length, [sorts], decl_names, body);
	}

	/// Weight, and patterns are optional. Bound should be an array of consts.
	mkExistsConst(bound, body, patterns = [], weight = 0) {
		return this._build(Z3.Z3_mk_exists_const, weight, bound.length, bound, patterns.length, patterns, body);
	}

	mkPattern(terms) {
		return this._build(Z3.Z3_mk_pattern, terms.length, terms);
	}
}

module.exports = Context;
