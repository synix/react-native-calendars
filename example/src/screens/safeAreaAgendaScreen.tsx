import React, {Component} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Agenda, AgendaSchedule} from 'react-native-calendars';
import {SafeAreaView} from 'react-native-safe-area-context';

interface State {
  items?: AgendaSchedule;
}

export default class SafeAreaAgendaScreen extends Component<State> {
  state: State = {
    items: undefined
  };

  render() {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Aphrodite</Text>
        </View>
        <Agenda
          selected={'2016-05-10'}
          minDate={'2012-05-10'}
          maxDate={'2022-05-30'}
          pastScrollRange={50}
          futureScrollRange={50}
          renderList={() => {
            return <View/>;
          }
          }
          renderHeader={(date?: XDate) => {
            return (
              <View style={styles.headerContainer}>
                <Text style={styles.headerMonth}>{date?.toString('MMMM')}</Text>
                <Text style={styles.headerYear}>{date?.toString('yyyy')}</Text>
              </View>
            );
          }}
          renderKnob={() => {
            return (
              <View style={styles.knob} />
            );
          }}
          hideKnob={false}
          showClosingKnob={true}
          hideExtraDays={true}
          hideDayNames={true}
          calendarStyle={{backgroundColor: '#D3D2FF'}}
          calendarHeight={300}
          animateScroll={true}
          onCalendarToggled={toggled => {
            console.log('⚡️ onCalendarToggled: ', toggled);
          }}
          theme={{
            calendarBackground: '#D3D2FF',
            textDayHeaderFontFamily: 'Manrope_500Medium',
            textDayHeaderFontWeight: '500',
            textDayHeaderFontSize: 12,
            textSectionTitleColor: '#6C727F',
            textDayFontSize: 14,
            textDayFontWeight: '700',
            textDayStyle: {
              color: '#121826'
            },
            indicatorColor: 'yellow'
          }}
        />
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D3D2FF'
  },

  titleContainer: {
    height: 80,
    padding: 20,
    marginTop: 2
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#121826'
  },
  headerContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingBottom: 8
  },
  headerMonth: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerYear: {
    fontSize: 10,
    fontWeight: '700',
  },
  knob: {
    width: 38,
    height: 4,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#A8A5FF',
    borderRadius: 2
  }
});
