import React, { useState } from 'react'
import {
  Item,
  LinkList,
  Span360,
  StyledNavLink,
  Wrapper,
  Button,
  MenuIcon,
  MainWrapper,
  Backdrop,
} from './AppBarStyles'

const AppBar = () => {
  const [displayMenu, setDisplayMenu] = useState(false)

  const handleMenu = () => {
    setDisplayMenu((displayMenu) => !displayMenu)
  }

  return (
    <MainWrapper>
      <Wrapper>
        <Span360>360°</Span360>
        {window.innerWidth > 634 && (
          <LinkList>
            <StyledNavLink to="/">
              <Item>Swap</Item>
            </StyledNavLink>
            <StyledNavLink to="/about">
              <Item>About</Item>
            </StyledNavLink>
            <StyledNavLink to="/history">
              <Item>History</Item>
            </StyledNavLink>
            <StyledNavLink to="/my-profit">
              <Item>My Profit</Item>
            </StyledNavLink>
          </LinkList>
        )}

        <Button>Connect</Button>

        {window.innerWidth <= 634 && (
          <MenuIcon onClick={handleMenu}>
            <rect width="22" height="2" fill="#646464" />
            <rect y="9" width="22" height="2" fill="#646464" />
            <rect y="18" width="22" height="2" fill="#646464" />
          </MenuIcon>
        )}
      </Wrapper>
      {displayMenu && (
        <>
          <Backdrop onClick={handleMenu} />
          <LinkList>
            <StyledNavLink onClick={handleMenu} to="/">
              <Item>Swap</Item>
            </StyledNavLink>
            <StyledNavLink onClick={handleMenu} to="/about">
              <Item>About</Item>
            </StyledNavLink>
            <StyledNavLink onClick={handleMenu} to="/history">
              <Item>History</Item>
            </StyledNavLink>
            <StyledNavLink onClick={handleMenu} to="/my-profit">
              <Item>My Profit</Item>
            </StyledNavLink>
          </LinkList>
        </>
      )}
    </MainWrapper>
  )
}

export default AppBar