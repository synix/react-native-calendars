import isFunction from 'lodash/isFunction';
import PropTypes from 'prop-types';
import XDate from 'xdate';
import memoize from 'memoize-one';

import React, {Component} from 'react';
import {
  View,
  Dimensions,
  Animated,
  ViewStyle,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent
} from 'react-native';

import {extractCalendarListProps, extractReservationListProps} from '../componentUpdater';
import {xdateToData, toMarkingFormat} from '../interface';
import {sameDate, sameMonth} from '../dateutils';
import {AGENDA_CALENDAR_KNOB} from '../testIDs';
import {VelocityTracker} from '../velocityTracker';
import {DateData, AgendaSchedule} from '../types';
import {getCalendarDateString} from '../services';
import styleConstructor from './style';
import WeekDaysNames from '../commons/WeekDaysNames';
import CalendarList, {CalendarListProps, CalendarListImperativeMethods} from '../calendar-list';
import ReservationList, {ReservationListProps}  from './reservation-list';

// 这个104相当于收缩时的高度，那么这个高度为什么是104?
// 收缩是从上到下weekdaynames，一行weekday，knob view
// weekdaynames的高度39.6, 一行weekday的高度32(上下padding各预留为4?), knob view的高度24
const HEADER_HEIGHT = 104;
// 底部knob的高度, 也就是renderKnob()渲染的元素的高度
const KNOB_HEIGHT = 24;

export type AgendaProps = CalendarListProps & ReservationListProps & {
  /** the list of items that have to be displayed in agenda. If you want to render item as empty date
  the value of date key kas to be an empty array []. If there exists no value for date key it is
  considered that the date in question is not yet loaded */
  items?: AgendaSchedule;
  /** callback that gets called when items for a certain month should be loaded (month became visible) */
  loadItemsForMonth?: (data: DateData) => void;
  /** callback that fires when the calendar is opened or closed */
  onCalendarToggled?: (enabled: boolean) => void;
  /** callback that gets called when day changes while scrolling agenda list */
  onDayChange?: (data: DateData) => void;
  /** specify how agenda knob should look like */
  renderKnob?: () => JSX.Element;
  /** override inner list with a custom implemented component */
  renderList?: (listProps: ReservationListProps) => JSX.Element;
  /** initially selected day */
  selected?: string; //TODO: Should be renamed 'selectedDay' and inherited from ReservationList
  /** Hide knob button. Default = false */
  hideKnob?: boolean;
  /** Whether the knob should always be visible (when hideKnob = false) */
  showClosingKnob?: boolean;
  /** 是否在calendar展开时显示顶部的weeknames, Default = false */
  showWeekNamesWhenScrollable?: boolean;
}

type State = {
  scrollY: Animated.Value; // scrollY是一个动画值，用于控制y方向的滚动位置
  calendarIsReady: boolean;
  calendarScrollable: boolean;
  firstReservationLoad: boolean;
  selectedDay: XDate;
  topDay: XDate;
  headerState: string;
};

/**
 * @description: Agenda component
 * @extends: CalendarList
 * @extendslink: docs/CalendarList
 * @example: https://github.com/wix/react-native-calendars/blob/master/example/src/screens/agenda.js
 * @gif: https://github.com/wix/react-native-calendars/blob/master/demo/assets/agenda.gif
 */
export default class Agenda extends Component<AgendaProps, State> {
  static displayName = 'Agenda';

  static propTypes = {
    ...CalendarList.propTypes,
    ...ReservationList.propTypes,
    items: PropTypes.object,
    style: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]),
    loadItemsForMonth: PropTypes.func,
    onCalendarToggled: PropTypes.func,
    onDayChange: PropTypes.func,
    renderKnob: PropTypes.func,
    renderList: PropTypes.func,
    selected: PropTypes.any, //TODO: Should be renamed 'selectedDay' and inherited from ReservationList
    hideKnob: PropTypes.bool,
    showClosingKnob: PropTypes.bool
  };

  private style: {[key: string]: ViewStyle};
  private viewHeight: number;
  private viewWidth: number;
  private scrollTimeout?: ReturnType<typeof setTimeout>;
  private currentMonth: XDate;
  private knobTracker: VelocityTracker;
  // 用于判断组件是否已挂载, 在componentDidMount中会设置为true, 在componentWillUnmount中会设置为false
  private _isMounted: boolean | undefined;

  // 以下refs是用于获取组件的引用
  private scrollPad: React.RefObject<any> = React.createRef();
  private calendar: React.RefObject<CalendarListImperativeMethods> = React.createRef();
  private knob: React.RefObject<View> = React.createRef();
  public list: React.RefObject<ReservationList> = React.createRef();

  constructor(props: AgendaProps) {
    super(props);

    this.style = styleConstructor(props.theme);

    const windowSize = Dimensions.get('window');
    // 这里只是将view width/height初始化为window size
    // 在onLayout中会将view width/height更新为顶层View的size
    this.viewHeight = windowSize.height;
    this.viewWidth = windowSize.width;

    this.scrollTimeout = undefined;
    this.setState({headerState: 'idle'});

    this.state = {
      scrollY: new Animated.Value(0),
      calendarIsReady: false,
      calendarScrollable: false,
      firstReservationLoad: false,
      selectedDay: this.getSelectedDate(props.selected),
      topDay: this.getSelectedDate(props.selected),
      headerState: 'idle',
    };

    // 当前月份是通过state.selectedDay来确定的
    this.currentMonth = this.state.selectedDay.clone();

    this.knobTracker = new VelocityTracker();
    this.state.scrollY.addListener(({value}) => {
      // 完全展开时，scrollY为0，完全收缩时，scrollY为最大值(view height - 104)
      this.knobTracker.add(value);
    });
  }

  componentDidMount() {
    this._isMounted = true;
    this.loadReservations(this.props);
  }

  componentWillUnmount() {
    this._isMounted = false;
    // 对应constructor中的state.scrollY.addListener()
    this.state.scrollY.removeAllListeners();
  }

  componentDidUpdate(prevProps: AgendaProps, prevState: State) {
    const newSelectedDate = this.getSelectedDate(this.props.selected);

    if (!sameDate(newSelectedDate, prevState.selectedDay)) {
      const prevSelectedDate = this.getSelectedDate(prevProps.selected);
      if (!sameDate(newSelectedDate, prevSelectedDate)) {
        this.setState({selectedDay: newSelectedDate});
        this.calendar?.current?.scrollToDay(newSelectedDate, this.calendarOffset(), true);
      }
    } else if (!prevProps.items) {
      this.loadReservations(this.props);
    }
  }

  static getDerivedStateFromProps(nextProps: AgendaProps) {
    if (nextProps.items) {
      return {firstReservationLoad: false};
    }
    return null;
  }

  getSelectedDate(date?: string) {
    return date ? new XDate(date) : new XDate(true);
  }

  calendarOffset() {
    // 为什么是96?
    // 默认情况下81是calendar每个月顶部CalendarHeader的高度(monthname + weekname)
    // 但是为了使week行上半部的day文字垂直居中，还得加上day高度(默认为32)的一半
    // 所以这里的准确来说是81 + 32 / 2 = 97，96只能说是近似值

    // this.viewHeight / 2 表示滚到居中对齐，而不是顶部对齐
    return (this.props.calendarHeaderHeight ?? 81) + 32 / 2 - this.viewHeight / 2;
  }

  initialScrollPadPosition = () => {
    return Math.max(0, this.viewHeight - HEADER_HEIGHT);
  };

  setScrollPadPosition = (y: number, animated: boolean) => {
    if (this.scrollPad?.current?.scrollTo) {
      this.scrollPad.current.scrollTo({x: 0, y, animated});
    } else {
      // Support for RN O.61 (Expo 37)
      this.scrollPad?.current?.getNode().scrollTo({x: 0, y, animated});
    }
  };

  toggleCalendarPosition = (open: boolean) => {
    const maxY = this.initialScrollPadPosition();
    this.setScrollPadPosition(open ? 0 : maxY, true);
    this.enableCalendarScrolling(open);
  };

  enableCalendarScrolling(enable = true) {
    this.setState({calendarScrollable: enable});

    this.props.onCalendarToggled?.(enable);

    // Enlarge calendarOffset here as a workaround on iOS to force repaint.
    // Otherwise the month after current one or before current one remains invisible.
    // The problem is caused by overflow: 'hidden' style, which we need for dragging
    // to be performant.
    // Another working solution for this bug would be to set removeClippedSubviews={false}
    // in CalendarList listView, but that might impact performance when scrolling
    // month list in expanded CalendarList.
    // Further info https://github.com/facebook/react-native/issues/1831
    this.calendar?.current?.scrollToDay(this.state.selectedDay, this.calendarOffset() + 1, true);
  }

  loadReservations(props: AgendaProps) {
    if ((!props.items || !Object.keys(props.items).length) && !this.state.firstReservationLoad) {
      this.setState({firstReservationLoad: true},
        () => {
          this.props.loadItemsForMonth?.(xdateToData(this.state.selectedDay));
        }
      );
    }
  }

  onDayPress = (d: DateData) => {
    this.chooseDay(d, !this.state.calendarScrollable);
  };

  chooseDay(d: DateData, optimisticScroll: boolean) {
    const day = new XDate(d.dateString);

    this.setState({
      calendarScrollable: false,
      selectedDay: day.clone()
    });

    this.props.onCalendarToggled?.(false);

    if (!optimisticScroll) {
      this.setState({topDay: day.clone()});
    }

    this.setScrollPadPosition(this.initialScrollPadPosition(), true);
    this.calendar?.current?.scrollToDay(day, this.calendarOffset(), true);

    this.props.loadItemsForMonth?.(xdateToData(day));
    this.props.onDayPress?.(xdateToData(day));
  }

  generateMarkings = memoize((selectedDay, markedDates, items) => {
    if (!markedDates) {
      markedDates = {};
      if (items) {
        Object.keys(items).forEach(key => {
          if (items[key] && items[key].length) {
            markedDates[key] = {marked: true};
          }
        });
      }
    }

    const key = toMarkingFormat(selectedDay);
    return {...markedDates, [key]: {...(markedDates[key] || {}), ...{selected: true}}};
  });

  onScrollPadLayout = () => {
    // When user touches knob, the actual component that receives touch events is a ScrollView.
    // It needs to be scrolled to the bottom, so that when user moves finger downwards,
    // scroll position actually changes (it would stay at 0, when scrolled to the top).
    this.setScrollPadPosition(this.initialScrollPadPosition(), false);
    // delay rendering calendar in full height because otherwise it still flickers sometimes
    setTimeout(() => this.setState({calendarIsReady: true}), 0);
  };

  onCalendarListLayout = () => {
    this.calendar?.current?.scrollToDay(this.state.selectedDay, this.calendarOffset(), false);
  };

  onLayout = (event: LayoutChangeEvent) => {
    this.viewHeight = event.nativeEvent.layout.height;
    this.viewWidth = event.nativeEvent.layout.width;
    this.forceUpdate();
  };

  onTouchStart = () => {
    this.setState({headerState: 'touched'});
    this.knob?.current?.setNativeProps({style: {opacity: 0.5}});
  };

  onTouchEnd = () => {
    this.knob?.current?.setNativeProps({style: {opacity: 1}});

    if (this.state.headerState === 'touched') {
      const isOpen = this.state.calendarScrollable;
      this.toggleCalendarPosition(!isOpen);
    }

    this.setState({headerState: 'idle'});
  };

  onStartDrag = () => {
    this.setState({headerState: 'dragged'});
    this.knobTracker.reset();
  };

  onSnapAfterDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // on Android onTouchEnd is not called if dragging was started
    this.onTouchEnd();
    const currentY = e.nativeEvent.contentOffset.y;

    this.knobTracker.add(currentY);
    const projectedY = currentY + this.knobTracker.estimateSpeed() * 250; /*ms*/
    const maxY = this.initialScrollPadPosition();
    const snapY = projectedY > maxY / 2 ? maxY : 0;
    this.setScrollPadPosition(snapY, true);

    this.enableCalendarScrolling(snapY === 0);
  };

  onVisibleMonthsChange = (months: DateData[]) => {
    this.props.onVisibleMonthsChange?.(months);

    if (this.props.items && !this.state.firstReservationLoad) {
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }

      this.scrollTimeout = setTimeout(() => {
        if (this._isMounted) {
          this.props.loadItemsForMonth?.(months[0]);
        }
      }, 200);
    }
  };

  onDayChange = (day: XDate) => {
    const withAnimation = sameMonth(day, this.state.selectedDay);
    this.calendar?.current?.scrollToDay(day, this.calendarOffset(), withAnimation);

    this.setState({selectedDay: day});

    this.props.onDayChange?.(xdateToData(day));
  };

  renderReservations() {
    const reservationListProps = extractReservationListProps(this.props);
    if (isFunction(this.props.renderList)) {
      return this.props.renderList({
        ...reservationListProps,
        selectedDay: this.state.selectedDay,
        topDay: this.state.topDay,
        onDayChange: this.onDayChange,
      });
    }

    return (
      <ReservationList
        {...reservationListProps}
        ref={this.list}
        selectedDay={this.state.selectedDay}
        topDay={this.state.topDay}
        onDayChange={this.onDayChange}
      />
    );
  }

  renderCalendarList() {
    const {markedDates, items} = this.props;
    const shouldHideExtraDays = this.state.headerState === 'idle' ? (this.state.calendarScrollable ? this.props.hideExtraDays : false) : true;
    const calendarListProps = extractCalendarListProps(this.props);

    return (
      <CalendarList
        {...calendarListProps}
        ref={this.calendar}
        current={getCalendarDateString(this.currentMonth.toString())}
        markedDates={this.generateMarkings(this.state.selectedDay, markedDates, items)}
        calendarWidth={this.viewWidth}
        scrollEnabled={this.state.calendarScrollable}
        hideExtraDays={shouldHideExtraDays}
        onLayout={this.onCalendarListLayout}
        onDayPress={this.onDayPress}
        onVisibleMonthsChange={this.onVisibleMonthsChange}
      />
    );
  }

  renderKnob() {
    const {showClosingKnob, hideKnob, renderKnob} = this.props;
    let knob: JSX.Element | null = <View style={this.style.knobContainer} />;

    if (!hideKnob) {
      const knobView = renderKnob ? renderKnob() : <View style={this.style.knob}/>;
      knob = !this.state.calendarScrollable || showClosingKnob ? (
        <View style={this.style.knobContainer}>
          <View ref={this.knob}>{knobView}</View>
        </View>
      ) : null;
    }
    return knob;
  }

  renderWeekDaysNames = () => {
    return (
      <WeekDaysNames
        firstDay={this.props.firstDay}
        style={this.style.dayHeader}
      />
    );
  };

  renderWeekNumbersSpace = () => {
    // 即使showWeekNumbers为true, 渲染的也是一个空View，所以renderWeekNumbersSpace()函数和showWeekNumbers都属于废弃代码吧
    return this.props.showWeekNumbers && <View style={this.style.dayHeader}/>;
  };

  render() {
    const {hideKnob, style, testID} = this.props;
    // agendaHeight等于root view height - header height(104)
    const agendaHeight = this.initialScrollPadPosition();

    // 下面通过state.scrollY.interpolate定义了4个从scroll pad动画值映射出来的插值
    const weekdaysStyle = [
      this.style.weekdays,
      this.props.showWeekNamesWhenScrollable ? undefined :
      {
        // 这里是通过scroll pad的state.scrollY动画值插值出weekdays view的opacity的值
        // 完全收缩时，state.scrollY等于agendaHeight，这时opacity为1, 即weekdays view完全不透明
        // 展开时，当state.scrollY大于agendaHeight - HEADER_HEIGHT, weekdays view慢慢开始出现，这时opacity从0开始慢慢变为1
        // 这里的extrapolate是'clamp', 确保输出值不会超出定义的范围。
        opacity: this.state.scrollY.interpolate({
          inputRange: [agendaHeight - HEADER_HEIGHT, agendaHeight],
          outputRange: [0, 1],
          extrapolate: 'clamp'
        }),
        // 这里是通过scroll pad的state.scrollY动画值插值出weekdays view的translateY的值
        // 完全展开时，state.scrollY等于0，这时translateY为agendaHeight - HEADER_HEIGHT, 即weekdays view完全隐藏
        // 完全收缩时，state.scrollY等于agendaHeight，这时translateY为0, 即weekdays view完全显示
        transform: [
          {
            translateY: this.state.scrollY.interpolate({
              inputRange: [Math.max(0, agendaHeight - HEADER_HEIGHT), agendaHeight],
              outputRange: [-HEADER_HEIGHT, 0],
              extrapolate: 'clamp'
            })
          }
        ]
      }
    ];

    // 这里是通过scroll pad的state.scrollY动画值插值出(calendar view父容器 + knob view)父容器的translateY的值
    // 完全展开时，state.scrollY等于0，这时translateY为agendaHeight, 即这个父容器bottom距离root view底部为0
    // 完全收缩时，state.scrollY等于agendaHeight，这时translateY为0, 即这个父容器bottom距离root view底部为agendaHeight
    const headerTranslate = this.state.scrollY.interpolate({
      inputRange: [0, agendaHeight],
      outputRange: [agendaHeight, 0],
      extrapolate: 'clamp'
    });

    // 这里是通过scroll pad的state.scrollY动画值插值出calendar view父容器的translateY的值
    // 完全展开时，state.scrollY等于0，这时translateY也为0，确保当前日期在垂直居中位置
    // 完全收缩时，state.scrollY等于agendaHeight，这时translateY为agendaHeight/2，相当于在这个过程中translateY始终为scrollY的1/2，即当前日期始终垂直居中
    const contentTranslate = this.state.scrollY.interpolate({
      inputRange: [0, agendaHeight],
      outputRange: [0, agendaHeight / 2],
      extrapolate: 'clamp'
    });

    const headerStyle = [
      this.style.header,
      {
        bottom: agendaHeight,
        // bottom设置为agendaHeight，即header view的底部距离屏幕底部是agendaHeight，
        // 然后通过translateY动画，translateY为0时，就是完全收缩状态，translateY为agendaHeight时，就是完全展开状态
        transform: [{translateY: headerTranslate}]
      }
    ];

    if (!this.state.calendarIsReady) {
      // limit header height until everything is setup for calendar dragging
      headerStyle.push({height: 0});
      // fill header with appStyle.calendarBackground background to reduce flickering
      weekdaysStyle.push({height: HEADER_HEIGHT});
    }

    const openCalendarScrollPadPosition =
      !hideKnob && this.state.calendarScrollable && this.props.showClosingKnob ? agendaHeight + HEADER_HEIGHT : 0;

    const shouldAllowDragging = !hideKnob && !this.state.calendarScrollable;

    const scrollPadPosition = (shouldAllowDragging ? HEADER_HEIGHT : openCalendarScrollPadPosition) - KNOB_HEIGHT;

    const scrollPadStyle = {
      height: KNOB_HEIGHT,
      top: scrollPadPosition,
    };

    return (
      <View testID={testID} onLayout={this.onLayout} style={[style, this.style.container]}>
        <View style={this.style.reservations}>{this.renderReservations()}</View>
        {/* 这个view的height是就是view height*/}
        <Animated.View style={headerStyle}>
          <Animated.View style={[this.style.animatedContainer, {transform: [{translateY: contentTranslate}]}]}>
            {this.renderCalendarList()}
          </Animated.View>
          {/* 这个渲染的元素的高度默认是24 */}
          {this.renderKnob()}
        </Animated.View>
        {/* 这个渲染的元素的高度默认是39.6 */}
        <Animated.View style={weekdaysStyle}>
          {/* renderWeekNumbersSpace()属于废弃代码 */}
          {this.renderWeekNumbersSpace()}
          {this.renderWeekDaysNames()}
        </Animated.View>
        {/* 这个scrollView的height就是knob view的height，默认是24，由scrollPadStyle中的height定义 */}
        <Animated.ScrollView
          ref={this.scrollPad}
          style={[this.style.scrollPadStyle, scrollPadStyle]}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={8}
          scrollsToTop={false}
          onTouchStart={this.onTouchStart}
          onTouchEnd={this.onTouchEnd}
          onScrollBeginDrag={this.onStartDrag}
          onScrollEndDrag={this.onSnapAfterDrag}
          // 将滚动状态contentOffset映射到动画值state.scrollY
          onScroll={Animated.event([{nativeEvent: {contentOffset: {y: this.state.scrollY}}}], {useNativeDriver: true})}
        >
          <View
            testID={AGENDA_CALENDAR_KNOB}
            // 这里的height相当于root view height - 80
            style={{height: agendaHeight + KNOB_HEIGHT}}
            onLayout={this.onScrollPadLayout}
          />
        </Animated.ScrollView>
      </View>
    );
  }
}
