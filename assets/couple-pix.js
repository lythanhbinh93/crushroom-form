document.addEventListener('DOMContentLoaded', function () {
  const input = document.querySelector('#mobile_code');
  window.intlTelInput(input, {
    initialCountry: 'vn',
    showSelectedDialCode: true,
    countrySearch: false,
    utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@20.3.0/build/js/utils.js',
  });

  const chooseFile1 = document.getElementById('choose-file-1');
  const imgPreview1 = document.getElementById('img-preview-1');
  const chooseFile2 = document.getElementById('choose-file-2');
  const imgPreview2 = document.getElementById('img-preview-2');

  // khi button click thì input type="file" dược click
  // document.querySelectorAll('button[for]').forEach(button => {
  //   button.addEventListener('click', () => {
  //       const targetId = button.getAttribute('for');
  //       const targetInput = document.getElementById(targetId);
  //       if (targetInput) {
  //           targetInput.click();
  //       }
  //   });
  // });

  document.querySelectorAll('button[data-file-remove]').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-file-remove');
        const dataFileIndex = button.getAttribute('data-file-index');
        const targetInput = document.getElementById(targetId);
        const imgPreview = document.getElementById(`img-preview-${dataFileIndex}`);
        if (targetInput) {
          console.log("hihi")
            targetInput.value= null;
            imgPreview.innerHTML="";
            button.closest('.dropzone--content').querySelector(".dropzone--placeholder").style.display="flex";
            button.closest('.dropzone--content').querySelector(".dropzone--preview--area").style.display="none";
        }
    });
  });

  document.querySelectorAll('input[type="file"]').forEach(chooseFile => {
    chooseFile.addEventListener('change', function (event) {
      var file = event.target.files[0];
      if (file) {
          // Hiển thị cửa sổ pop-up và cắt ảnh
          const parentEmt = this.parentElement;
          const imgPreview = parentEmt.querySelector(".img-preview");
          openImageCropModal(this, imgPreview);
          // getImgData(this,imgPreview);
          parentEmt.querySelector(".dropzone--placeholder").style.display = "none";
          parentEmt.querySelector(".dropzone--preview--area").style.display = "block";
      }
    });
  });

  // function getImgData(chooseFile, imgPreview) {
  //   const files = chooseFile.files[0];
  //   if (files) {
  //     const fileReader = new FileReader();
  //     fileReader.readAsDataURL(files);
  //     fileReader.addEventListener('load', function () {
  //       imgPreview.style.display = 'block';
  //       imgPreview.innerHTML = '<img src="' + this.result + '" />';
  //       var ImgData = this.result.split("base64,")[1];
  //       imgPreview.closest('.dropzone').querySelector('input[type="hidden"]').value = ImgData;
  //     });
  //   }
  // }


  function openImageCropModal(chooseFile, imgPreview) {
    const file=  chooseFile.files[0];

     // Tạo phần tử overlay
     let overlay = document.createElement('div');
     overlay.classList.add('t4s-close-overlay', 't4s-op-0', 'is--visible');

     // Chèn phần tử overlay vào sau thẻ body
     document.body.insertAdjacentElement('afterend', overlay);

    // Tạo phần tử cho pop-up
    let modal = document.createElement('div');
    modal.classList.add('modal');

    // Tạo phần tử cho Croppie
    let croppieContainer = document.createElement('div');
    croppieContainer.id = 'croppie-container';
    modal.appendChild(croppieContainer);


    // Tạo nút Crop
    var cropButton = document.createElement('button');
    cropButton.textContent = 'OK';
    cropButton.classList.add('dropzone--placeholder--button'); // Thêm class "a" cho nút
    cropButton.addEventListener('click', function () {
        cropImage();
        closeModal();
    });
    modal.appendChild(cropButton);

    // Thêm pop-up vào trang web
    document.body.appendChild(modal);

    // Khởi tạo Croppie
    var croppie = new Croppie(croppieContainer, {
      viewport: {
          width: 300, // Độ rộng của viewport
          height: 300, // Chiều cao của viewport
          type: 'circle' // Loại viewport là hình tròn
      },
      boundary: { width: 300, height: 400, type: 'infinity' },
      enableZoom: true,
      enforceBoundary: false
  });

  // ===== Zoom +/- (chỉ bổ sung, không thay đổi code cũ) =====
(function addZoomButtons() {
  // Tạo 2 nút +/−
  var zoomControls = document.createElement('div');
  zoomControls.style.display = 'flex';
  zoomControls.style.gap = '8px';
  zoomControls.style.justifyContent = 'center';
  zoomControls.style.margin = '8px 0';

  var minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.textContent = '−';
  minusBtn.className = 'dropzone--placeholder--button';

  var plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.textContent = '+';
  plusBtn.className = 'dropzone--placeholder--button';

  zoomControls.appendChild(minusBtn);
  zoomControls.appendChild(plusBtn);

  // Chèn vào modal, ngay dưới vùng croppie
  // (modal đã append croppieContainer trước đó)
  modal.insertBefore(zoomControls, modal.lastChild);

  // Tìm slider nội bộ của Croppie .cr-slider (có thể sinh ra sau 1 tick)
  var STEP = 0.01;
  function triggerInput(el) {
    var ev = new Event('input', { bubbles: true });
    el.dispatchEvent(ev);
  }
  function clamp(val, min, max) {
    if (min == null || max == null) return val;
    return Math.min(max, Math.max(min, val));
  }

  function wireWithSlider(slider) {
    // Điều khiển slider để Croppie tự xử min/max
    minusBtn.addEventListener('click', function () {
      var cur = parseFloat(slider.value || '0');
      var min = parseFloat(slider.min || '0');
      var max = parseFloat(slider.max || '1');
      slider.value = String(clamp(cur - STEP, min, max));
      triggerInput(slider);
    });
    plusBtn.addEventListener('click', function () {
      var cur = parseFloat(slider.value || '0');
      var min = parseFloat(slider.min || '0');
      var max = parseFloat(slider.max || '1');
      slider.value = String(clamp(cur + STEP, min, max));
      triggerInput(slider);
    });
  }

  // Thử lấy ngay
  var sliderNow = croppieContainer.querySelector('.cr-slider');
  if (sliderNow) {
    wireWithSlider(sliderNow);
    return;
  }

  // Nếu slider chưa sẵn, dùng MutationObserver đợi nó xuất hiện
  var ob = new MutationObserver(function () {
    var slider = croppieContainer.querySelector('.cr-slider');
    if (slider) {
      wireWithSlider(slider);
      ob.disconnect();
    }
  });
  ob.observe(croppieContainer, { childList: true, subtree: true });

  // Fallback: nếu vì lý do nào đó không có slider, dùng API setZoom
  minusBtn.addEventListener('click', function () {
    var cur = (croppie.get() || {}).zoom || 0;
    croppie.setZoom(cur - STEP);
  });
  plusBtn.addEventListener('click', function () {
    var cur = (croppie.get() || {}).zoom || 0;
    croppie.setZoom(cur + STEP);
  });
})();


    // Đặt ảnh vào Croppie để cắt
    var reader = new FileReader();
    reader.onload = function (e) {
        croppie.bind({
            url: e.target.result
        });
    };
    reader.readAsDataURL(file);

  // Hàm để cắt ảnh
  function cropImage() {
    croppie.result({
      type: 'blob', // Trả về dữ liệu dạng blob
      size: { width: 700, height: 700 } // Kích thước mong muốn
    }).then(function (blob) {
        // Khởi tạo FileReader
        var reader = new FileReader();
        // reader.readAsDataURL(file);
        // Đặt hành động khi FileReader hoàn thành việc đọc blob
        // reader.onload = function(event) {
        //     // Lấy base64 image từ blob và log ra console
        //     var base64Image = event.target.result;
        //     console.log(base64Image);
        // };

        reader.addEventListener('load', function (e) {
          var oldImage = new Image();
          // var base64Image = e.target.result;
          oldImage.src = e.target.result;;
          // imgPreview.style.display = 'block';
          // imgPreview.innerHTML = '<img src="' + base64Image + '" />';
          oldImage.onload = function() {
              var radius = Math.max(oldImage.width, oldImage.height) / 2;
              var borderWidth = 2; // Độ dày của viền
              radius += borderWidth;

              var canvas = document.createElement('canvas');
              var ctx = canvas.getContext('2d');
              canvas.width = radius * 2;
              canvas.height = radius * 2;

              ctx.beginPath();
              ctx.arc(radius, radius, radius, 0, Math.PI * 2);
              ctx.closePath();
              ctx.fillStyle = 'black'; // Màu nền là đen
              ctx.fill();

              ctx.save();
              ctx.beginPath();
              ctx.arc(radius, radius, radius - borderWidth, 0, Math.PI * 2, true); // Trừ đi độ dày của viền
              ctx.closePath();
              ctx.clip();
              ctx.drawImage(oldImage, radius - oldImage.width / 2, radius - oldImage.height / 2, oldImage.width, oldImage.height);
              ctx.restore();

              var newImage = new Image();
              newImage.src = canvas.toDataURL();

              // Hiển thị ảnh mới
              imgPreview.appendChild(newImage);
              imgPreview.style.display = 'block';
              var ImgData =  canvas.toDataURL().split("base64,")[1];
              imgPreview.closest('.dropzone').querySelector('input[type="hidden"]').value = ImgData;
          };
        });
        // Đọc blob như base64
        reader.readAsDataURL(blob);
      });
  }

  // Hàm để đóng pop-up
  function closeModal() {
      document.body.removeChild(modal);
      // document.body.removeChild(overlay);
      overlay.remove();
  }
}

  const radios = document.querySelectorAll('.radio-input');
  radios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      const value = this.value;
      const showBlock = document.querySelectorAll('.show-block');
      showBlock.forEach(function (element) {
        if (value === 'many-image') {
          element.style.display = 'block';
        } else if (value === 'one-image') {
          element.style.display = 'none';
        }
      });
    });
  });

  //validate
  function validateForm() {
    const phoneNumber = document.getElementById('mobile_code').value.trim();
    const phoneError = document.getElementById('phone-error');
    const fileInput = document.getElementById('choose-file-1');
    const fileError = document.getElementById('file-error');
    // const textarea1 = document.querySelector('.textarea-1');
    // const textarea1Error = document.getElementById('textarea-1');
    // const textarea2 = document.querySelector('.textarea-2');
    // const textarea2Error = document.getElementById('textarea-2');
    clearError()
    let hasError = false; // Biến để kiểm tra có lỗi hay không

    if (phoneNumber === '') {
      phoneError.textContent = 'Please fill in field';
      phoneError.style.display = 'block';
      document.querySelector('.form-phone #mobile_code').classList.add('has-error');
      hasError = true;
    }
    if (fileInput.files.length === 0) {
      fileError.textContent = 'Please fill in field';
      fileError.style.display = 'block';
      document.querySelector('.choose-file .dropzone').classList.add('has-error');
      hasError = true;
    }

    // const elementsBlock = document.querySelectorAll('.form-control.show-block');
    // elementsBlock.forEach((element) => {
    //   if (getComputedStyle(element).display === 'block') {
    //     if (textarea1.value.trim() === '') {
    //       textarea1Error.textContent = 'Please fill in field';
    //       textarea1Error.style.display = 'block';
    //       textarea1.classList.add('has-error');
    //       hasError = true;
    //     }
    //     if (textarea2.value.trim() === '') {
    //       textarea2Error.textContent = 'Please fill in field';
    //       textarea2Error.style.display = 'block';
    //       textarea2.classList.add('has-error');
    //       hasError = true;
    //     }
    //   }
    // });
    return !hasError;
  }

  function clearError() {
    const phoneError = document.getElementById('phone-error');
    const fileError = document.getElementById('file-error');
    // const textarea1 = document.querySelector('.textarea-1');
    // const textarea1Error = document.getElementById('textarea-1');
    // const textarea2 = document.querySelector('.textarea-2');
    // const textarea2Error = document.getElementById('textarea-2');

    phoneError.textContent = '';
    phoneError.style.display = 'none';
    document.querySelector('.form-phone #mobile_code').classList.remove('has-error');

    fileError.textContent = '';
    fileError.style.display = 'none';
    document.querySelector('.choose-file .dropzone').classList.remove('has-error');

    // textarea1Error.textContent = '';
    // textarea1Error.style.display = 'none';
    // textarea1.classList.remove('has-error');

    // textarea2Error.textContent = '';
    // textarea2Error.style.display = 'none';
    // textarea2.classList.remove('has-error');
  }

  const scriptURL = 'https://script.google.com/macros/s/AKfycbweeqxM3blNgfqB4A1y2HBaGfQcfUcpTdksG0GBiW29NLyUOr1C0Hl95Naju3AjgRq4qg/exec'

  const form = document.forms['contact-form'];
  const loaderBtn = document.getElementById('loaderBtn');
  const submitBtn = document.getElementById('submitBtn');
  const submitButton = document.querySelector('button[type="submit"]');

  form.addEventListener('submit', e => {
    e.preventDefault();
    if(validateForm()){
      e.preventDefault();
      loaderBtn.style.display = 'inline-block';
      submitBtn.style.display = 'none';
      submitButton.disabled = true;

      // Lấy số điện thoại và format (chỉ giữ số)
      const phoneInput = document.getElementById('mobile_code');
      let phoneNumber = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';

      // Debug log
      console.log('Phone input value:', phoneInput ? phoneInput.value : 'not found');
      console.log('Phone number (cleaned):', phoneNumber);

      // Tạo FormData mới và copy tất cả fields từ form
      const formData = new FormData();

      // Copy tất cả fields từ form
      const originalFormData = new FormData(form);
      for (let [key, value] of originalFormData.entries()) {
        formData.append(key, value);
        console.log('FormData field:', key, '=', value ? value.substring(0, 50) + '...' : '(empty)');
      }

      // Nếu không có phone từ input, thử lấy từ field 'Name'
      if (!phoneNumber && formData.get('Name')) {
        phoneNumber = formData.get('Name').replace(/\D/g, '');
        console.log('Phone from Name field:', phoneNumber);
      }

      // Thêm tên file
      const filename1 = phoneNumber || 'image_' + Date.now();
      formData.set('Filename1', filename1);
      console.log('==> Filename1:', filename1);

      // Kiểm tra nếu có ảnh 2
      const imgData2 = document.getElementById('ImgData2').value;
      if (imgData2 && imgData2.trim() !== '') {
        const filename2 = phoneNumber ? phoneNumber + '_2' : 'image_' + Date.now() + '_2';
        formData.set('Filename2', filename2);
        console.log('==> Filename2:', filename2);
      }

      // Log tất cả FormData để debug
      console.log('=== Final FormData ===');
      for (let [key, value] of formData.entries()) {
        if (key.includes('Filename') || key === 'Name') {
          console.log(key + ':', value);
        }
      }

      fetch(scriptURL, { method: 'POST', body: formData})
      .then(response => {
        alert("Bạn đã gửi ảnh thành công." );
        // console.log("hihi")

      })
      .then(() => {
        window.location.href="https://crushroom.vn/pages/thank-you";
        // window.location.reload();
      })
      .catch(error => {
        alert("Chưa gửi được ảnh. Xin thử lại" );
        console.error('Error!', error.message);
      })
      .finally(()=>{
          submitButton.disabled = false;
          loaderBtn.style.display = 'none';
          submitBtn.style.display = 'inline-block';
      })
    }
  })


  // const submitButton = document.querySelector('button[type="submit"]');
  // submitButton.addEventListener('click', function (event) {
  //   event.preventDefault();
  //   if(validateForm()){
  //       e.preventDefault();
  //       console.log("hihi");
  //       fetch(scriptURL, { method: 'POST', body: new FormData(form)})
  //       .then(response => alert("Thank you! your form is submitted successfully." ))
  //       .then(() => { window.location.reload(); })
  //       .catch(error => console.error('Error!', error.message))

  //   }
  // });
});

