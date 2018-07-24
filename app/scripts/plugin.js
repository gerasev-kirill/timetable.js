/*jshint -W079*/

'use strict';

var Timetable = function() {
	function prettyFormatHour(hour) {
		var prefix = hour < 10 ? '0' : '';
		return prefix + hour + ':00';
	}
	this.scope = {
		hourStep: 1,
		dateFormatter: function(date, isNewDay){
			if (!isNewDay){
				return prettyFormatHour(date.getHours());
			} else {
				return date.getDate() + '/' + date.getMonth() + ', ' + prettyFormatHour(date.getHours());
			}
		}
	};
	this.locations = [];
	this.events = [];
};

Timetable.Renderer = function(tt) {
	if (!(tt instanceof Timetable)) {
		throw new Error('Initialize renderer using a Timetable');
	}
	this.timetable = tt;
};

(function() {
	function isInt(number) {
		return number === parseInt(number, 10);
	}
	function isDate(date){
		date = new Date(date);
		return !isNaN(date.getTime());
	}
	function isElement(node){
		// from angular
		return !!(node && (node.nodeName || (node.prop && node.attr && node.find)));  // We have an on and find method part of jQuery API.
	}
	function isValidDateRange(start, end){
		return isDate(start) && isDate(end);
	}
	function computeDurationInHours(start, end) {
		return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
	}
	function locationExistsIn(loc, locs) {
		for (var k=0; k<locs.length; k++) {
			if (loc === locs[k].id) {
				return true;
			}
		}
		return false;
	}
	function isValidTimeRange(start, end) {
		var correctTypes = isDate(start) && isDate(end);
		var correctOrder = start < end;
		return correctTypes && correctOrder;
	}
	function toNode(htmlString){
		var span = document.createElement('span');
		span.innerHTML = htmlString.trim();
		return span;
	}

	Timetable.prototype = {
		setScope: function(start, end) {
			if (isValidDateRange(start, end)){
				this.scope.start = new Date(start);
				this.scope.end = new Date(end);
			} else{
				throw new RangeError('Timetable scope should consist of (start, end) in dates');
			}
			return this;
		},
		getScope: function(){
			return JSON.parse(JSON.stringify(this.scope));
		},
		setHourStep: function(step){
			if (!isInt(step) || step < 0){
				throw new Error('Step should be int and more than 0');
			}
			this.scope.hourStep = step;
		},
		setDateFormatterFunction: function(fn){
			this.scope.dateFormatter = fn;
		},
		addLocations: function(newLocations) {
			function hasProperFormat() {
				return newLocations instanceof Array && typeof newLocations[0] === 'string';
			}

			function hasExtendFormat() {
				return newLocations instanceof Array && newLocations[0] instanceof Object;
			}

			var existingLocations = this.locations;

			if (hasProperFormat()) {
				newLocations.forEach(function(loc) {
					if (!locationExistsIn(loc, existingLocations)) {
						existingLocations.push({
							id: loc,
							title: loc
						});
					} else {
						throw new Error('Location already exists');
					}
				});
			} else if (hasExtendFormat()) {
				newLocations.forEach(function(loc) {
					if (loc.hasOwnProperty('locations')){
						if (!locationExistsIn(loc, existingLocations)) {
							existingLocations.push(loc);
						} else {
							throw new Error('Location already exists');
						}
						loc.locations.forEach(function(loc2){
							if (!locationExistsIn(loc2, existingLocations)) {
								if (loc2 instanceof Object){
									existingLocations.push(loc2);
								}
								else{
									existingLocations.push({
										id: loc2,
										title: loc2
									});
								}
							} else {
								throw new Error('Location already exists');
							}
						});
						return;
					}
					if (!locationExistsIn(loc, existingLocations)) {
						existingLocations.push(loc);
					} else {
						throw new Error('Location already exists');
					}
				});
			}
			else {
				throw new Error('Tried to add locations in wrong format');
			}

			return this;
		},
		addEvent: function(name, location, start, end, options) {
			if (!locationExistsIn(location, this.locations)) {
				throw new Error('Unknown location');
			}
			start = new Date(start);
			end = new Date(end);
			if (!isValidTimeRange(start, end)) {
				console.log('Invalid time range: ' + JSON.stringify([start, end]));
				return;
			}

			var optionsHasValidType = Object.prototype.toString.call(options) === '[object Object]';

			this.events.push({
				name: name,
				location: location,
				startDate: start,
				endDate: end,
				options: optionsHasValidType ? options : undefined
			});

			return this;
		}
	};

	function emptyNode(node) {
		while (node.firstChild) {
			node.removeChild(node.firstChild);
		}
	}


	Timetable.Renderer.prototype = {
		draw: function(selector, tableStyle) {
			var timetable = this.timetable;
			var dates = [];
			this.timetable.events.forEach(function(event){
				dates.push(event.startDate);
				dates.push(event.endDate);
			});
			var datesAsInt = dates.map(function(d){return d.getTime();});
			var minDate = this.timetable.scope.start;
			var maxDate = this.timetable.scope.end;
			if (['vertical', 'horizontal'].indexOf(tableStyle) === -1){
				tableStyle = 'horizontal';
			}
			if (!this.timetable.scope.start){
				var minIndex = datesAsInt.indexOf(Math.min.apply(null, datesAsInt));
				minDate = dates[minIndex];
			}
			if (!this.timetable.scope.end){
				var maxIndex = datesAsInt.indexOf(Math.max.apply(null, datesAsInt));
				maxDate = dates[maxIndex];
			}
			if (minDate.getMinutes() !== 0){
				minDate.setMinutes(0);
			}
			var scopeDurationHours = computeDurationInHours(minDate, maxDate);
			var dstep = scopeDurationHours / timetable.scope.hourStep;
			if (!isInt(dstep)){
				// round up maxDate
				scopeDurationHours = Math.ceil(dstep) * timetable.scope.hourStep;
				maxDate = new Date(minDate);
				maxDate.setHours(scopeDurationHours);
			}
			this.timetable.scope.durationHours = scopeDurationHours;


			function checkContainerPrecondition(container) {
				if (container === null) {
					throw new Error('Timetable container not found');
				}
			}
			function appendTimetableAside(container) {
				var asideNode = container.appendChild(document.createElement('aside'));
				var asideULNode = asideNode.appendChild(document.createElement('ul'));
				appendRowHeaders(asideULNode);
			}
			function appendRowHeaders(ulNode) {
				for (var k=0; k<timetable.locations.length; k++) {
					var url = timetable.locations[k].href;
					var liNode = ulNode.appendChild(document.createElement('li'));
					var spanNode = liNode.appendChild(document.createElement('span'));
					if (tableStyle === 'vertical'){
						liNode.className = 'th-column';
					}
					if (url !== undefined) {
						var aNode = liNode.appendChild(document.createElement('a'));
						aNode.href = timetable.locations[k].href;
						aNode.appendChild(spanNode);
					}
					spanNode.className = 'row-heading';
					if (timetable.locations[k].hasOwnProperty('locations')){
						liNode.className = 'row-heading-section';
					}
					if (timetable.locations[k].hasOwnProperty('class')){
						liNode.className += timetable.locations[k].class;
					}
					liNode.title = timetable.locations[k].title;
					spanNode.textContent = timetable.locations[k].title;
				}
			}
			function appendTimetableSection(container) {
				var sectionNode = container.appendChild(document.createElement('section'));
				var timeNode = sectionNode.appendChild(document.createElement('time'));
				var headerheight = appendColumnHeaders(timeNode);
				return appendTimeRows(timeNode, headerheight);
			}
			function appendColumnHeaders(node) {
				var headerNode = node.appendChild(document.createElement('header'));
				var headerULNode = headerNode.appendChild(document.createElement('ul'));
				var currentDate = new Date(minDate);
				var liNode, spanNode, lastDay;
				while (currentDate.getTime() <= maxDate.getTime()) {
					liNode = headerULNode.appendChild(document.createElement('li'));
					spanNode = toNode(
						timetable.scope.dateFormatter(
							currentDate,
							currentDate.getDate() !== lastDay
						)
					);
					spanNode.className = 'time-label';
					liNode.appendChild(spanNode);
					lastDay = currentDate.getDate();
					currentDate.setHours(currentDate.getHours() + timetable.scope.hourStep);
				}
				return (headerNode.getBoundingClientRect().height || 0) - (liNode.getBoundingClientRect().height || 0);
			}
			function appendTimeRows(node, headerheight) {
				if (tableStyle === 'vertical'){
					node = node.appendChild(document.createElement('div'));
					node.className = 'room-timeline-vertical-container';
					node = node.appendChild(document.createElement('div'));
				}
				var ulNode = node.appendChild(document.createElement('ul'));
				ulNode.className = 'room-timeline';
				for (var k=0; k<timetable.locations.length; k++) {
					var liNode = ulNode.appendChild(document.createElement('li'));
					if (tableStyle === 'vertical' && headerheight && headerheight > 0){
						liNode.style.height = headerheight + 'px';
						liNode.className = 'td-column';
					}
					if (timetable.locations[k].hasOwnProperty('locations')){
						liNode.className = (liNode.className || '') + ' section';
						var b = liNode.appendChild(document.createElement('b'));
						b.className = 'section-title';
						var span = b.appendChild(document.createElement('span'));
						span.textContent = timetable.locations[k].title;
						continue;
					}
					appendLocationEvents(timetable.locations[k], liNode);/**/
				}
				return node;
			}
			function appendLocationEvents(location, node) {
				for (var k=0; k<timetable.events.length; k++) {
					var event = timetable.events[k];
					if (event.location === location.id) {
						appendEvent(event, node);
					}
				}
			}
			function appendEvent(event, node) {
				var hasOptions = event.options !== undefined;
				var hasURL, hasAdditionalClass, hasDataAttributes = false;

				if(hasOptions) {
					hasURL = event.options.url !== undefined;
					hasAdditionalClass = event.options.class !== undefined;
					hasDataAttributes = event.options.data !== undefined;
				}

				var elementType = hasURL ? 'a' : 'span';
				var aNode = node.appendChild(document.createElement(elementType));
				var smallNode = aNode.appendChild(document.createElement('small'));
				if (hasOptions){
					aNode.title = event.options.tooltip || event.name;
				}
				else{
					aNode.title = event.name;
				}

				if (hasURL) {
					aNode.href = event.options.url;
				}
				aNode.setAttribute('data-start-date', event.startDate);
				aNode.setAttribute('data-end-date', event.endDate);
				if(hasDataAttributes){
					for (var key in event.options.data) {
						aNode.setAttribute('data-'+key, event.options.data[key]);
					}
				}

				aNode.className = hasAdditionalClass ? 'time-entry ' + event.options.class : 'time-entry';
				if (tableStyle === 'vertical'){
					var height = computeEventBlockWidth(event);
					var top = computeEventBlockOffset(event);
					if (top + height > 100){
						height = 100 - top;
					}
					aNode.style.height = height + '%';
					aNode.style.top = top + '%';
				} else {
					aNode.style.width = computeEventBlockWidth(event) + '%';
					aNode.style.left = computeEventBlockOffset(event) + '%';
				}
				smallNode.textContent = event.name;
			}
			function computeEventBlockWidth(event) {
				var durationHours = computeDurationInHours(event.startDate, event.endDate);
				return durationHours / scopeDurationHours * 100;
			}
			function computeEventBlockOffset(event) {
				var hoursBeforeEvent = computeDurationInHours(minDate, event.startDate);
				return hoursBeforeEvent / scopeDurationHours * 100;
			}

			var container;
			if (isElement(selector)){
				container = selector;
			} else{
				container = document.querySelector(selector);
			}
			checkContainerPrecondition(container);
			emptyNode(container);
			appendTimetableAside(container);
			appendTimetableSection(container);
		}
	};

})();
