/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ITextSearchPreviewOptions, OneLineRange, TextSearchResult, SearchRange } from 'vs/platform/search/common/search';

suite('TextSearchResult', () => {

	const previewOptions1: ITextSearchPreviewOptions = {
		matchLines: 1,
		charsPerLine: 100
	};

	function assertPreviewRangeText(text: string, result: TextSearchResult): void {
		assert.equal(
			result.preview.text.substring(result.preview.match.startColumn, result.preview.match.endColumn),
			text);
	}

	test('empty without preview options', () => {
		const range = new OneLineRange(5, 0, 0);
		const result = new TextSearchResult('', range);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('', result);
	});

	test('empty with preview options', () => {
		const range = new OneLineRange(5, 0, 0);
		const result = new TextSearchResult('', range, previewOptions1);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('', result);
	});

	test('short without preview options', () => {
		const range = new OneLineRange(5, 4, 7);
		const result = new TextSearchResult('foo bar', range);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('bar', result);
	});

	test('short with preview options', () => {
		const range = new OneLineRange(5, 4, 7);
		const result = new TextSearchResult('foo bar', range, previewOptions1);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('bar', result);
	});

	test('leading', () => {
		const range = new OneLineRange(5, 25, 28);
		const result = new TextSearchResult('long text very long text foo', range, previewOptions1);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('foo', result);
	});

	test('trailing', () => {
		const range = new OneLineRange(5, 0, 3);
		const result = new TextSearchResult('foo long text very long text long text very long text long text very long text long text very long text long text very long text', range, previewOptions1);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('foo', result);
	});

	test('middle', () => {
		const range = new OneLineRange(5, 30, 33);
		const result = new TextSearchResult('long text very long text long foo text very long text long text very long text long text very long text long text very long text', range, previewOptions1);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('foo', result);
	});

	test('truncating match', () => {
		const previewOptions: ITextSearchPreviewOptions = {
			matchLines: 1,
			charsPerLine: 1
		};

		const range = new OneLineRange(0, 4, 7);
		const result = new TextSearchResult('foo bar', range, previewOptions);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('b', result);
	});

	test('one line of multiline match', () => {
		const previewOptions: ITextSearchPreviewOptions = {
			matchLines: 1,
			charsPerLine: 10000
		};

		const range = new SearchRange(5, 4, 6, 3);
		const result = new TextSearchResult('foo bar\nfoo bar', range, previewOptions);
		assert.deepEqual(result.range, range);
		assertPreviewRangeText('bar', result);
	});

	// test('all lines of multiline match', () => {
	// 	const previewOptions: ITextSearchPreviewOptions = {
	// 		matchLines: 5,
	// 		charsPerLine: 10000
	// 	};

	// 	const range = new SearchRange(5, 4, 6, 3);
	// 	const result = new TextSearchResult('foo bar\nfoo bar', range, previewOptions);
	// 	assert.deepEqual(result.range, range);
	// 	assertPreviewRangeText('bar\nfoo', result);
	// });
});