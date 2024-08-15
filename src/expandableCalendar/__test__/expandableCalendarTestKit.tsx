import React from 'react';
import {toMarkingFormat} from '../../interface';
import ExpandableCalendar, {ExpandableCalendarProps} from '../index';
import CalendarProvider, {CalendarContextProviderProps} from '../Context/Provider';

const XDate = require('xdate');

const today = new XDate();
export const testIdExpandableCalendar = 'myExpandableCalendar';

export const expandableCalendarTestIDs = (testId: string) => {
  return {
    leftArrow: `${testId}.leftArrow`,
    rightArrow: `${testId}.rightArrow`,
  };
};
export const generateExpandableCalendarWithContext = ({
  expandableCalendarProps,
  calendarContextProps,
}: {
  expandableCalendarProps?: Partial<ExpandableCalendarProps>;
  calendarContextProps?: Partial<CalendarContextProviderProps>;
} = {}) => {
  const defaultContextProps: CalendarContextProviderProps = {
    date: toMarkingFormat(today),
    showTodayButton: true,
  };
  const defaultExpandableCalendarProps: ExpandableCalendarProps = {
    testID: testIdExpandableCalendar,
  };

  return (
    <CalendarProvider {...defaultContextProps} {...calendarContextProps}>
      <ExpandableCalendar {...defaultExpandableCalendarProps} {...expandableCalendarProps}/>
    </CalendarProvider>
  );
};
