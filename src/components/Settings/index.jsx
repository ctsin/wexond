import React from 'react'

import ToolBar from '../ToolBar'

import TestSection from './Sections/Test'

import Dropdown from '../Dropdown'

export default class Settings extends React.Component {
  constructor () {
    super()

    window.dictionary = window.dictionaryAPI.get()

    document.title = window.dictionary.pages.settings.title
  }

  render() {
    return (
      <div className='settings'>
        <ToolBar title='Settings' />
        <div className='content'>
          <Dropdown />
        </div>
      </div>
    )
  }
}