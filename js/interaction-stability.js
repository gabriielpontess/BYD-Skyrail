function closeUserMenu({restoreFocus=false}={}){
  const button=document.querySelector('#user-menu-button[aria-expanded="true"]');
  const menu=document.querySelector('#user-menu:not(.hidden)');
  if(!button||!menu)return false;
  button.click();
  if(restoreFocus)button.focus({preventScroll:true});
  return true;
}

document.addEventListener('pointerdown',event=>{
  const menu=document.querySelector('#user-menu:not(.hidden)');
  if(!menu)return;
  if(event.target.closest?.('#user-menu,#user-menu-button'))return;
  closeUserMenu();
},{passive:true});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape')closeUserMenu({restoreFocus:true});
});

addEventListener('hashchange',()=>closeUserMenu());
addEventListener('blur',()=>closeUserMenu());
