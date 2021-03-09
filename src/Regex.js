/**
 * Copyright Blake Loring <blake_l@parsed.uk> 2015
 * Approximate JavaScript regular expression to Z3 regex parser
 */

function CullOuterRegex(regex) {
	let firstSlash = regex.indexOf("/");
	let lastSlash = regex.lastIndexOf("/");
	return regex.substr(firstSlash + 1, lastSlash - 1);
}

function FindClosingParen(regex, idx) {
	let open = 1;

	while (idx < regex.length) {
        
		if (regex[idx - 1] != "\\" && regex[idx] == "(") { open++; }
		if (regex[idx - 1] != "\\" && regex[idx] == ")") { open--; }

		if (open == 0) {
			return idx;
		}

		idx++;
	}

	return -1;
}

function Desugar(regex) {
 
	let i;

	//Strip ?!
	while ((i = regex.indexOf("(?!")) != -1 || (i = regex.indexOf("?=")) != -1) {
		let end = FindClosingParen(regex, i + 1);
		regex = regex.slice(0, i) + regex.slice(end + 1);
	}

	while ((i = regex.indexOf("(")) != -1 || (i = regex.indexOf(")")) != -1) {
		if (regex[i - 1] != "\\") {
			regex = regex.slice(0, i) + regex.slice(i + 1);
		}
	}

	//Remove word boundaries
	regex = regex.replace(/\\b|\\B/g, "");

	return regex;
}

let REGEX_CTR = 0;

function RegexRecursive(ctx, regex, idx) { 

	const pp_steps = [];

	let lrctr = REGEX_CTR++;

	let captures = [];
	let previousCaptureAst = [];
	let assertions = [];
	let fill_ctr = 0;
	let backreferences = false;

	function BuildError(msg) {
		return {
			error: msg,
			idx: idx,
			remaining: regex.slice(idx)
		};
	}

	//TODO: This is a bad way of handling symbolIn, in general the whole processing fillers is weak
	let shouldAddFillerIn = true;

	function nextFiller() {
		return ctx.mkStringVar("" + lrctr + " Fill " + fill_ctr++);
	}

	function moreRange() {
		return idx < regex.length;
	}

	function more() {
		return moreRange() && current() != "|" && current() != ")";
	}

	function mk(v) {
		return ctx.mkSeqToRe(ctx.mkString(v));
	}

	function current() {
        
		if (regex.length > idx) {
			return regex[idx];
		}

		return undefined;
	}

	function next(num) {
		let r = current();
		idx += (num || 1);
		return r;
	}

	function peek(num) {

		if (typeof(num) === "undefined") {
			num = 1;
		}

		return regex[idx + num];
	}

	function Any() {
		let beforeNewline = ctx.mkReRange(ctx.mkString("\\x00"), ctx.mkString("\\x09"));
		let afterNewline = ctx.mkReRange(ctx.mkString("\\x0b"), ctx.mkString("\\xff"));
		return ctx.mkReUnion(beforeNewline, afterNewline);
	}

	/**
     * The . character isnt all chracters
     * This will accept any character
     */
	function TruelyAny() {
		return ctx.mkReRange(ctx.mkString("\\x00"), ctx.mkString("\\xff"));
	}

	function ParseRangerNextEscaped() {
		let c1 = next();
		if (c1 == "\\") {
			return next();
		} else {
			return c1;
		}
	}

	function ParseRangeInner() {

		let union = undefined;

		while (moreRange() && current() != "]") {

			let c1 = ParseRangerNextEscaped();
			let range = undefined;

			if (current() == "-" && peek() != "]") {
				next();
				let c2 = ParseRangerNextEscaped();
				range = ctx.mkReRange(ctx.mkString(c1), ctx.mkString(c2));
			} else {
				range = ctx.mkSeqToRe(ctx.mkString(c1));
			}

			if (!union) {
				union = range;
			} else {
				union = ctx.mkReUnion(union, range);
			}
		}

		return union;
	}

	function ParseRange() {
		next();

		let negate = false;

		if (current() == "^") {
			next();
			negate = true;
		}

		let r = ParseRangeInner();

		if (negate) {
			let comp = ctx.mkReComplement(r);
			r = ctx.mkReIntersect(TruelyAny(), comp);
		}

		if (next() == "]") {
			return r;
		} else {
			throw BuildError("Regex Parsing Error (Range)");
		}
	}

	let Specials = {
		".": Any
	};

	function Alpha() {
		let p1 = ctx.mkReRange(ctx.mkString("a"), ctx.mkString("z"));
		let p2 = ctx.mkReRange(ctx.mkString("A"), ctx.mkString("Z"));
		return ctx.mkReUnion(p1, p2);
	}

	function Digit() {
		return ctx.mkReRange(ctx.mkString("0"), ctx.mkString("9"));
	}

	function Whitespace() {
		let p1 = mk(" ");
		let p2 = mk("\t");
		let p3 = mk("\r");
		let p4 = mk("\n");
		let p5 = mk("\f");
		let p6 = mk("\v");
		return ctx.mkReUnion(p1, ctx.mkReUnion(p2, ctx.mkReUnion(p3, ctx.mkReUnion(p4, ctx.mkReUnion(p5, p6)))));
	}

	function AlphaNumeric() {
		return ctx.mkReUnion(Alpha(), Digit());
	}

	function Word() {
		return ctx.mkReUnion(AlphaNumeric(), mk("_"));
	}

	function ParseAtom1() {
		let parsed_str = next();

		const IS_JUST_TEXT = /^[a-zA-Z0-9]$/;
		const IS_SPECIAL = /^[*+?]$/;
        
		//Hack to greedly eat anything that is definately not a special character
		//Makes SMT formulee look prettier
		//We need to look ahead for this and just drop back to standard parsing atom by atom if
		//the lookahead is special
		while (current() && IS_JUST_TEXT.test(current()) && !IS_SPECIAL.test(peek())) {
			parsed_str += next();
		}

		return mk(parsed_str);
	}

	function ParseMaybeSpecial() {
		if (Specials[current()]) {
			return Specials[next()]();
		} else {
			return ParseAtom1();
		}
	}

	function isHex(char) {
		return /^[0-9A-Fa-f]+$/.test(char);
	}

	/*
	function isDigits(char) {
		return /^[0-9]+$/.test(char);
	}
  */

	function ParseMaybeEscaped(captureIndex) {
		if (current() == "\\") {
			next();

			let c = next();

			if (c == "d") {
				return Digit();
			} else if (c == "D") {
				return ctx.mkReIntersect(TruelyAny(), ctx.mkReComplement(Digit()));
			} else if (c == "w") {
				return Word();
			} else if (c == "W") {
				return ctx.mkReIntersect(TruelyAny(), ctx.mkReComplement(Word()));
			} else if (c == "s") {
				return Whitespace();
			} else if (c == "S") {
				return ctx.mkReIntersect(TruelyAny(), ctx.mkReComplement(Whitespace()));
			} else if (c == "n") {
				return mk("\n");
			} else if (c == "x") {
				let c1 = next();
				let c2 = next();

				if (!isHex(c1) || !isHex(c2)) {
					throw BuildError("Expected hex character at " + c1 + " and " + c2);
				}

				let hexToInt = parseInt(c1 + c2, 16);
				let hexAsString = String.fromCharCode(hexToInt);

				return mk(hexAsString);
			} else if (c == "u") {

				let expectingRBrace = false;

				if (current() == "{") {
					expectingRBrace = true;
					next();
				}

				let unicodeSequence = next() + next() + next() + next();
                
				if (expectingRBrace && next() != "}") {
					throw BuildError("Expecting RBrace in unicode sequence");
				}

				if (!isHex(unicodeSequence)) {
					throw BuildError("Expected digits in unicode sequence " + unicodeSequence);
				}

				let unicodeString = String.fromCharCode(parseInt(unicodeSequence, 16));
				return mk(unicodeString);
			} else if (c == "r") {
				return mk("\r");
			} else if (c == "v") {
				return mk("\v");
			} else if (c == "t") {
				return mk("\t");
			} else if (c == "f") {
				return mk("\f");
			} else if (c >= "1" && c <= "9") {

				let idx = parseInt(c);

				if (idx < captures.length) {
					backreferences = true;
					addToCapture(captureIndex, captures[idx]);
					shouldAddFillerIn = false;
					return previousCaptureAst[idx];
				} else {
					return mk("");
				}

			} else if (c == "b") {
				pp_steps.push({ type: "b", idx: idx });
				return mk("");
			} else if (c == "B") {
				pp_steps.push({ type: "B", idx: idx });
				return mk("");
			} else if (c == "0") {
				return mk("\\x00");
			}

			return mk(c);
		} else {
			return ParseMaybeSpecial();
		}
	}

	function ParseMaybeRange(captureIndex) {
		if (current() == "[") {
			return ParseRange();
		} else {
			return ParseMaybeEscaped(captureIndex);
		}
	}

	function rewriteCaptureOptional(idx) {
		//Rewrite capture[n] to be capture[n] or ''
		let orFiller = nextFiller();
		either(orFiller, captures[idx], ctx.mkString(""));
		captures[idx] = orFiller;
	}


	function addToCapture(idx, thing) {
		captures[idx] = ctx.mkSeqConcat([captures[idx], thing]);
	}

	function symbolIn(atoms) {
		let nfil = nextFiller();
		assertions.push(ctx.mkSeqInRe(nfil, atoms));
		return nfil;
	}

	function ParseMaybeCaptureGroupStart(captureIndex) {
		function buildPlusConstraints(atoms, plusGroup) {
			let ncap = captures[plusGroup];

			atoms = ctx.mkRePlus(atoms);

			//String = Something + Capture ^ in atoms
			let added = ctx.mkSeqConcat([nextFiller(), ncap]);
			assertions.push(ctx.mkSeqInRe(added, atoms));
              
			addToCapture(captureIndex, added);
			return atoms;
		}

		function buildStarConstraints(atoms, starGroup) {
			let ncap = captures[starGroup];

			atoms = ctx.mkReStar(atoms);

			let added = ctx.mkSeqConcat([nextFiller(), ncap]);
			assertions.push(ctx.mkImplies(ctx.mkEq(ncap, ctx.mkString("")), ctx.mkEq(added, ctx.mkString(""))));

			addToCapture(captureIndex, added);
			return atoms;
		}

		/*
    function buildOptionConstraints(atoms, optionGroup) {
			addToCapture(captureIndex, captures[optionGroup]);
		}
    */

		if (current() == "(") {
			next();

			let capture = true;

			//Ignore ?: capture groups can't be modelled
			if (current() == "?") {
				next();

				if (current() != ":") {
					throw BuildError("Expected : after ?");
				}

				next();
				capture = false;
			}

			let newestCapture = captures.length;

			let atoms = ParseCaptureGroup(captureIndex, capture);

			if (next() != ")") {
				throw BuildError("Expected ) (Capture Group Close)");
			}

			if (capture) {
				switch (current()) {
				case "?":
				case "*":
				{
					//If anything the capture is optional then anything inside it is also optional
					//TODO: Take a list of originals and rewrite an implication
					//iff Len(origin) > 0 then c[i] = o[i]
					for (let i = newestCapture; i < captures.length; i++) {
						rewriteCaptureOptional(i);
					}

					buildStarConstraints(atoms, newestCapture);
					break;
				}
				case "{":
				case "+":
				{
					buildPlusConstraints(atoms, newestCapture);
					break;
				}
				default:
				{
					addToCapture(captureIndex, captures[newestCapture]);
					break;
				}
				}
			}

			shouldAddFillerIn = false;

			return atoms;
		} else {
			return ParseMaybeRange(captureIndex);
		}
	}

	function ParseMaybeAssertion(captureIndex) {

		if (current() == "(" && peek() == "?" && (peek(2) == "!" || peek(2) == "=")) {
			const end = FindClosingParen(regex, idx + 3);
			const re = regex.slice(idx + 3, end);
			pp_steps.push({ type: peek(2), re: re, idx: end + 1 });
			idx = end + 1;
		}

		return ParseMaybeCaptureGroupStart(captureIndex);
	}

	function ParseMaybePSQ(captureIndex) {

		let atom = ParseMaybeAssertion(captureIndex);

		if (current() == "*") {
			next();
			if (current() == "?") { next(); }
			atom = ctx.mkReStar(atom);
		} else if (current() == "+") {
			next();
			if (current() == "?") { next(); }
			atom = ctx.mkRePlus(atom);
		} else if (current() == "?") {
			next();
			if (current() == "?") { next(); }
			atom = ctx.mkReOption(atom);
		}

		return atom;
	}

	function digit(offset) {
		if (typeof(offset) === "undefined") {
			offset = 0;
		}
		return peek(offset) >= "0" && peek(offset) <= "9";
	}

	function ParseNumber() {


		let numStr = "";

		if (!digit()) {
			throw BuildError("Expected Digit (Parse Number)");
		}

		while (digit()) {
			numStr += next();
		}

		return parseInt(numStr);
	}

	function ParseLoopCount() {
		let n1 = ParseNumber();

		if (current() == ",") {
			next();

			if (!digit()) {
				//Either a syntax error or a min loop, assume a min loop
				return [n1, undefined];
			} else {
				let n2 = ParseNumber();
				return [n1, n2];
			}
		} else {
			return [n1, n1];
		}
	}

	function ParseMaybeLoop(captureIndex) {
		let atom = ParseMaybePSQ(captureIndex);

		if (current() == "{" && digit(1)) {
			next();

			let [lo, hi] = ParseLoopCount();

			if (!next() == "}") {
				throw BuildError("Expected } following loop count");
			}

			//Discard any succeeding ?
			if (current() == "?") { next(); }

			//If hi is undefined then it's a min loop {5,}
			if (hi === undefined) {
				atom = ctx.mkReConcat(ctx.mkReLoop(atom, lo, lo), ctx.mkReStar(atom));
			} else {
				atom = ctx.mkReLoop(atom, lo, hi);
			}
		}

		return atom;
	}

	function ParseMaybeAtoms(captureIndex) {

		let rollup = null;

		while (more()) {

			while (current() == "^" || current() == "$") {
				//TODO: Find out how to handle multiline
				next();
			}

			//TODO: This is horrible, anchors should be better
			if (more()) {

				//let capturesStart = captures.length;
				let parsed = ParseMaybeLoop(captureIndex);

				if (shouldAddFillerIn) {
					addToCapture(captureIndex, symbolIn(parsed));
				}

				shouldAddFillerIn = true;

				rollup = rollup ? ctx.mkReConcat(rollup, parsed) : parsed;
			}
		}
        
		return rollup || mk("");
	}

	function either(v, left, right) {
		assertions.push(ctx.mkOr(ctx.mkEq(v, left), ctx.mkEq(v, right)));
		return v;
	}

	function buildAlternationCaptureConstraints(captureIndex, startCaptures, endLeftCaptures, endRightCaptures, cLeft, cRight) {
		let leftCaptures = [];
		let leftOriginals = [];
		let rightCaptures = [];
		let rightOriginals = [];

		for (let i = startCaptures; i < endLeftCaptures; i++) {
			leftOriginals.push(captures[i]);
			rewriteCaptureOptional(i);
			leftCaptures.push(captures[i]);
		}

		for (let i = endLeftCaptures; i < endRightCaptures; i++) {
			rightOriginals.push(captures[i]);
			rewriteCaptureOptional(i);
			rightCaptures.push(captures[i]);
		}
        
		let cFinal = nextFiller();

		function buildSide(side, left, original, right) {
			let forceRightNothing = right.map(x => ctx.mkEq(x, ctx.mkString("")));
			let forceLeftOriginal = left.map((x, idx) => ctx.mkEq(left[idx], original[idx]));
			assertions.push(ctx.mkImplies(ctx.mkEq(cFinal, side), ctx.mkAndList(forceRightNothing.concat(forceLeftOriginal))));
		}

		buildSide(cLeft, leftCaptures, leftOriginals, rightCaptures);
		buildSide(cRight, rightCaptures, rightOriginals, leftCaptures);

		either(cFinal, cLeft, cRight);

		captures[captureIndex] = cFinal;
	}

	function ParseMaybeOption(captureIndex) {

		//Track the length of captures through parsing of either side
		//If it changes then the blocks parsed have a capture in them
		//and will need extra constraints
		let startCaptures = captures.length;

		//The captures on an option are a bit tricky
		//The capture is either going to be the current C0 + [Some stuff] | [Some Stuff]
		//So we parse one side, reset the capture to cStart, then parse the other and express
		//the final constraint as an or of the two
		let cStart = captures[captureIndex];
		captures[captureIndex] = ctx.mkString("");

		let ast = ParseMaybeAtoms(captureIndex);

		//Track the end of the left captures
		let endLeftCaptures = captures.length;

		let cLeft = captures[captureIndex];

		if (current() == "|") {
			captures[captureIndex] = ctx.mkString("");
			next();

			let ast2 = ParseMaybeOption(captureIndex);

			let cRight = captures[captureIndex];

			let endRightCaptures = captures.length;

			//If any capture groups have been defined in the alternation we need to
			//build some new string constraints on the result
			buildAlternationCaptureConstraints(captureIndex, startCaptures, endLeftCaptures, endRightCaptures, ctx.mkSeqConcat([cStart, cLeft]), ctx.mkSeqConcat([cStart, cRight]));

			ast = ctx.mkReUnion(ast, ast2);
		} else {
			captures[captureIndex] = ctx.mkSeqConcat([cStart, cLeft]);
		}

		return ast;
	}

	function ParseCaptureGroup(captureIndex, capture) {

		if (capture) {
			captureIndex = captures.length;
			previousCaptureAst.push(null);
			captures.push(ctx.mkString(""));
		}

		let r = ParseMaybeOption(captureIndex);

		if (capture) {
			assertions.push(ctx.mkSeqInRe(captures[captureIndex], r));
			previousCaptureAst[captureIndex] = r;
		}

		return r;
	}

	let ast = ParseCaptureGroup(0, true);
	let implier = captures[0];

	let startIndex;
	let anchoredStart = undefined;
	let anchoredEnd = undefined;

	if (regex[0] !== "^") {
		anchoredStart = nextFiller();
		ast = ctx.mkReConcat(ctx.mkReStar(TruelyAny()), ast);
		implier = ctx.mkSeqConcat([anchoredStart, implier]);
		startIndex = ctx.mkSeqLength(anchoredStart);
	} else {
		startIndex = ctx.mkIntVal(0);
	}

	if (regex[regex.length - 1] !== "$") {
		anchoredEnd = nextFiller();
		ast = ctx.mkReConcat(ast, ctx.mkReStar(TruelyAny()));
		implier = ctx.mkSeqConcat([implier, anchoredEnd]);
	}

	/**
     * All assertions are post-processed into SMT
     * This is done be re-parsing a desugared version of the regex and intersecting it with the AST
     */
	pp_steps.forEach(item => {

		const ds_lhs = Desugar(regex.substr(0, item.idx));
		const ds_rhs = Desugar(regex.substr(item.idx));
        
		const lhs = RegexRecursive(ctx, ds_lhs + "$", 0).ast;
		const rhs = RegexRecursive(ctx, "^" + ds_rhs, 0).ast;

		if (item.type == "b" || item.type == "B") {

			//Constants for use in query
			const any_string = ctx.mkReStar(TruelyAny());

			let word = Word();
			let not_word = ctx.mkReComplement(Word());

			//If B then flip word and not word
			if (item.type == "B") {
				const t = not_word;
				not_word = word;
				word = t;
			}

			const empty_string = mk("");

			//L = lhs in .*\W & rhs in \w.*
			const l1_w = ctx.mkReConcat(any_string, not_word); 
			const l1 = ctx.mkReUnion(ctx.mkReIntersect(lhs, l1_w), empty_string);

			const l2_w = ctx.mkReConcat(word, any_string);
			const l2 = ctx.mkReIntersect(rhs, l2_w);

			const l = ctx.mkReConcat(l1, l2);

			//R - lhs in .*\w & rhs in \W.*
			const r1_w = ctx.mkReConcat(any_string, word);
			const r1 = ctx.mkReIntersect(lhs, r1_w);

			const r2_w = ctx.mkReConcat(not_word, any_string);
			const r2 = ctx.mkReUnion(ctx.mkReIntersect(rhs, r2_w), empty_string);

			const r = ctx.mkReConcat(r1, r2);

			//Assert ast intersects l | r
			ast = ctx.mkReIntersect(ast, ctx.mkReUnion(l, r));
		} else if (item.type == "=" || item.type == "!") {

			//Compute the asserted regex
			let assert = RegexRecursive(ctx, "^" + item.re + "$", 0).ast;
			assert = ctx.mkReConcat(assert, ctx.mkReStar(TruelyAny()));

			//Negate it if ?!
			if (item.type == "!") {
				assert = ctx.mkReComplement(assert);
			}

			const lr = ctx.mkReConcat(lhs, ctx.mkReIntersect(rhs, assert));
            
			ast = ctx.mkReIntersect(ast, lr);
		} else {
			throw "Currently unsupported";
		}
	});

	//Give unique names to all captures for Ronny
	for (let i = 0; i < captures.length; i++) {
		const current = captures[i];
		captures[i] = nextFiller();
		assertions.push(ctx.mkEq(captures[i], current));
	}

	//TODO: Fix tagging to be multiline
	return {
		ast: ast,
		implier: implier,
		assertions: assertions,
		captures: captures,
		startIndex: startIndex,
		anchoredStart: anchoredStart,
		anchoredEnd: anchoredEnd,
		backreferences: backreferences,
		idx: idx //Return the index so recursion assertions work out
	};
}

function RegexOuter(ctx, regex) {
	try {
		return RegexRecursive(ctx, CullOuterRegex("" + regex), 0, false);
	} catch (e) {
		throw `${e.error ? e.error.toString() : "" + e} ${e.idx} "${e.remaining}" parsing regex "${regex}" ${e.stack}`;
	}
}

module.exports = RegexOuter;
